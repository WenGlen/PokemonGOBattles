'use client';

import { useEffect, useMemo, useState } from 'react';
import SidePanel from '@/components/SidePanel';
import TimelineView from '@/components/Timeline';
import { simulate } from '@/lib/battle';
import type { AppData, SideConfig } from '@/lib/app-data';
import { battleStats, type LeagueCp } from '@/lib/stats';
import { zhName } from '@/lib/types';

/** 兩隻對位的逐回合模擬 */
export default function Simulator({ data, cp }: { data: AppData; cp: LeagueCp }) {
  const [strategy, setStrategy] = useState<'optimal' | 'energy'>('optimal');
  const [a, setA] = useState<SideConfig | null>(null);
  const [b, setB] = useState<SideConfig | null>(null);

  const list = data.listFor(cp);

  // 第一次進來給一組預設對位；換聯盟時重算推薦招式
  useEffect(() => {
    if (list.length < 2) return;
    setA((prev) => data.defaultsFor(prev?.id ?? list[0].id, cp));
    setB((prev) => data.defaultsFor(prev?.id ?? list[1].id, cp));
  }, [data, cp, list]);

  const la = a ? data.toLoadout(a, cp, strategy) : null;
  const lb = b ? data.toLoadout(b, cp, strategy) : null;
  const result = useMemo(() => (la && lb ? simulate(la, lb) : null), [la, lb]);

  if (!a || !b) return null;

  return (
    <>
      <div className="leagues sub center">
        {([['optimal', '最佳出招'], ['energy', '能量一滿就丟']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={strategy === k} onClick={() => setStrategy(k)}>{label}</button>
        ))}
      </div>

      <div className="sides">
        <SidePanel title="我方" cls="you" cfg={a} set={setA} data={data} cp={cp} />
        <SidePanel title="對手" cls="foe" cfg={b} set={setB} data={data} cp={cp} />
      </div>

      {result && la && lb && (
        <>
          <div className="verdict">
            <span className={`big ${result.winner === 'a' ? 'win' : result.winner === 'b' ? 'lose' : ''}`}>
              {result.winner === 'a' ? '你贏' : result.winner === 'b' ? '你輸' : '平手'}
            </span>
            <span className="sub">
              第 {result.endTurn} 回合結束（{((result.endTurn * 500) / 1000).toFixed(1)} 秒）· 我方剩 {result.analysis.hpLeft.a}／{battleStats(la.pokemon.stats, la.ivs, la.level, la.shadow).hp} HP · 對手剩 {result.analysis.hpLeft.b}／{battleStats(lb.pokemon.stats, lb.ivs, lb.level, lb.shadow).hp} HP
            </span>
            <span className="sub" style={{ marginLeft: 'auto' }}>評分 {result.analysis.rating.a}／1000</span>
          </div>

          <div className="cards">
            <div className="card">
              <div className="k">我方第一發大招</div>
              <div className="v">
                {result.analysis.firstChargedTurn.a
                  ? <>第 {result.analysis.firstChargedTurn.a.turn} 回合 <small>· {result.analysis.firstChargedTurn.a.fastNeeded} 次快招</small></>
                  : '—'}
              </div>
            </div>
            <div className="card">
              <div className="k">對手第一發大招</div>
              <div className="v">
                {result.analysis.firstChargedTurn.b
                  ? <>第 {result.analysis.firstChargedTurn.b.turn} 回合 <small>· {result.analysis.firstChargedTurn.b.fastNeeded} 次快招</small></>
                  : '—'}
              </div>
            </div>
            <div className="card">
              <div className="k">CMP（同回合誰先出手）</div>
              <div className="v">
                {result.analysis.cmpWinner === 'a' ? '我方搶先' : result.analysis.cmpWinner === 'b' ? '對手搶先' : '同時'}{' '}
                <small>攻擊 {result.analysis.cmpAtk.a.toFixed(1)} vs {result.analysis.cmpAtk.b.toFixed(1)}</small>
              </div>
            </div>
            <div className="card">
              <div className="k">一次快招傷害</div>
              <div className="v">
                {result.analysis.fastDamage.a} <small>vs</small> {result.analysis.fastDamage.b}
              </div>
            </div>
          </div>

          <TimelineView result={result} names={[zhName(la.pokemon), zhName(lb.pokemon)]} />
        </>
      )}
    </>
  );
}
