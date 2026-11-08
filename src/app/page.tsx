'use client';

import { useEffect, useMemo, useState } from 'react';
import Combo from '@/components/Combo';
import TimelineView from '@/components/Timeline';
import ChangelogView from '@/components/Changelog';
import { simulate } from '@/lib/battle';
import { LEAGUES, battleStats, suggestedBuild, type LeagueCp } from '@/lib/stats';
import { TYPE_ZH } from '@/lib/typeChart';
import { zhName, type Changelog, type GameMaster, type Loadout, type MoveData, type PokemonData } from '@/lib/types';

interface Meta {
  gamemasterTimestamp: string;
  source: { repo: string; license: string };
  counts: { pokemon: number; moves: number };
  checks: { name: string; ok: boolean; detail: string }[];
}

/** 一側的使用者選擇 */
interface SideConfig {
  id: string;
  fast: string;
  charged: [string, string | null];
  shields: number;
}

export default function Page() {
  const [gm, setGm] = useState<GameMaster | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ranks, setRanks] = useState<Record<string, { id: string; score: number; moveset: string[] }[]>>({});
  const [log, setLog] = useState<Changelog | null>(null);
  const [cp, setCp] = useState<LeagueCp>(1500);
  const [strategy, setStrategy] = useState<'optimal' | 'energy'>('optimal');
  const [a, setA] = useState<SideConfig | null>(null);
  const [b, setB] = useState<SideConfig | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('data/gamemaster.json').then((r) => r.json()),
      fetch('data/rankings.json').then((r) => r.json()),
      fetch('data/meta.json').then((r) => r.json()),
      // 日誌是附加資訊，抓不到也不該讓整頁掛掉
      fetch('data/changelog.json').then((r) => r.json()).catch(() => ({ entries: [] })),
    ]).then(([g, rk, m, cl]) => {
      setGm(g);
      setRanks(rk);
      setMeta(m);
      setLog(cl);
    });
  }, []);

  const monById = useMemo(() => new Map((gm?.pokemon ?? []).map((p) => [p.id, p])), [gm]);
  const moveById = useMemo(() => new Map((gm?.moves ?? []).map((m) => [m.id, m])), [gm]);

  /** 這個聯盟的候選清單，照 pvpoke 排名排序，沒上榜的排後面 */
  const list = useMemo(() => {
    if (!gm) return [];
    const order = new Map((ranks[String(cp)] ?? []).map((r, i) => [r.id, i]));
    return [...gm.pokemon].sort((x, y) => (order.get(x.id) ?? 9999) - (order.get(y.id) ?? 9999) || x.dex - y.dex);
  }, [gm, ranks, cp]);

  /** 用 pvpoke 推薦的招式組當預設 */
  function defaultsFor(id: string): SideConfig {
    const p = monById.get(id)!;
    const rec = (ranks[String(cp)] ?? []).find((r) => r.id === id)?.moveset;
    const fast = rec?.[0] && p.fast.includes(rec[0]) ? rec[0] : p.fast[0];
    const c1 = rec?.[1] && p.charged.includes(rec[1]) ? rec[1] : p.charged[0];
    const c2 = rec?.[2] && p.charged.includes(rec[2]) ? rec[2] : p.charged.find((m) => m !== c1) ?? null;
    return { id, fast, charged: [c1, c2], shields: 1 };
  }

  // 資料載入後給一組預設對位
  useEffect(() => {
    if (!gm || a || list.length === 0) return;
    setA(defaultsFor(list[0].id));
    setB(defaultsFor(list[1].id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gm, list]);

  // 換聯盟時重算雙方的推薦招式
  useEffect(() => {
    if (!gm || !a || !b) return;
    setA(defaultsFor(a.id));
    setB(defaultsFor(b.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cp]);

  function toLoadout(c: SideConfig): Loadout | null {
    const p = monById.get(c.id);
    const fm = moveById.get(c.fast);
    if (!p || !fm) return null;
    const cms = c.charged.map((id) => (id ? moveById.get(id) : null)).filter(Boolean) as MoveData[];
    if (!cms.length) return null;
    const build = suggestedBuild(p, cp);
    return { pokemon: p, fastMove: fm, chargedMoves: cms, level: build.level, ivs: build.ivs, shields: c.shields, shadow: Boolean(p.shadow), strategy };
  }

  const la = a ? toLoadout(a) : null;
  const lb = b ? toLoadout(b) : null;
  const result = useMemo(() => (la && lb ? simulate(la, lb) : null), [la, lb]);

  if (!gm || !meta || !a || !b) {
    return <div className="wrap"><div className="loading">載入資料中…</div></div>;
  }

  const okCount = meta.checks.filter((c) => c.ok).length;

  return (
    <div className="wrap">
      <header className="top">
        <h1>寶可夢 GO 對戰模擬器</h1>
        <span className="chip">2026-06-23 新版系統</span>
        <span className="meta">
          資料 {meta.gamemasterTimestamp.slice(0, 10)} · {meta.source.repo} · 驗證 <b>{okCount}/{meta.checks.length} 通過</b>
        </span>
      </header>

      {log && log.entries.length > 0 && <ChangelogView log={log} />}

      <div className="leagues">
        {LEAGUES.map((lg) => (
          <button key={lg.cp} aria-pressed={cp === lg.cp} onClick={() => setCp(lg.cp)}>
            {lg.name}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {([['optimal', '最佳出招'], ['energy', '能量一滿就丟']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={strategy === k} onClick={() => setStrategy(k)}>
            {label}
          </button>
        ))}
      </div>

      <div className="sides">
        <SidePanel title="我方" cls="you" cfg={a} set={setA} list={list} monById={monById} moveById={moveById} cp={cp} defaultsFor={defaultsFor} />
        <SidePanel title="對手" cls="foe" cfg={b} set={setB} list={list} monById={monById} moveById={moveById} cp={cp} defaultsFor={defaultsFor} />
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

      <div className="foot">
        資料源 <a href="https://github.com/pvpoke/pvpoke" target="_blank" rel="noreferrer">pvpoke/pvpoke</a>（MIT）
        · 對戰規則照 <a href="https://pokemongo.com/news/pvp-updates2026" target="_blank" rel="noreferrer">官方 2026-06-23 公告</a>
        · 更新資料跑 <code>npm run data</code>，驗證跑 <code>npm run verify</code>
        <br />
        出招決策是 pvpoke 搜尋演算法的簡化版，勝負方向與 pvpoke 官方對位結果一致率約 80%；傷害、能量、回合時序則為精確計算。
      </div>
    </div>
  );
}

/** 單側的設定面板 */
function SidePanel({
  title, cls, cfg, set, list, monById, moveById, cp, defaultsFor,
}: {
  title: string;
  cls: string;
  cfg: SideConfig;
  set: (c: SideConfig) => void;
  list: PokemonData[];
  monById: Map<string, PokemonData>;
  moveById: Map<string, MoveData>;
  cp: LeagueCp;
  defaultsFor: (id: string) => SideConfig;
}) {
  const p = monById.get(cfg.id);
  if (!p) return null;
  const build = suggestedBuild(p, cp);
  const st = battleStats(p.stats, build.ivs, build.level, Boolean(p.shadow));
  const fm = moveById.get(cfg.fast);

  return (
    <div className={`panel ${cls}`}>
      <h2>{title}</h2>
      <div className="field">
        <Combo list={list} value={cfg.id} onChange={(id) => set(defaultsFor(id))} />
      </div>
      <div className="chips" style={{ marginBottom: 9 }}>
        {p.types.map((t) => <span key={t} className="chip">{TYPE_ZH[t] ?? t}</span>)}
        {p.shadow && <span className="chip">暗影</span>}
      </div>

      <div className="field">
        <label>快招{fm ? `（${fm.turns} 回合 · 能量 +${fm.energyGain}）` : ''}</label>
        <select value={cfg.fast} onChange={(e) => set({ ...cfg, fast: e.target.value })}>
          {p.fast.map((id) => {
            const m = moveById.get(id);
            return <option key={id} value={id}>{m ? zhName(m) : id}{m ? ` · ${m.power}力 ${m.turns}回合 +${m.energyGain}` : ''}</option>;
          })}
        </select>
      </div>

      {[0, 1].map((slot) => (
        <div className="field" key={slot}>
          <label>大招 {slot + 1}</label>
          <select
            value={cfg.charged[slot] ?? ''}
            onChange={(e) => {
              const next: [string, string | null] = [...cfg.charged] as [string, string | null];
              next[slot] = e.target.value || null;
              set({ ...cfg, charged: next });
            }}
          >
            {slot === 1 && <option value="">（不帶第二招）</option>}
            {p.charged.map((id) => {
              const m = moveById.get(id);
              return <option key={id} value={id}>{m ? zhName(m) : id}{m ? ` · ${m.power}力 ${m.energy}能量` : ''}</option>;
            })}
          </select>
        </div>
      ))}

      <div className="field">
        <label>護盾</label>
        <div className="shields">
          {[0, 1, 2].map((n) => (
            <button key={n} aria-pressed={cfg.shields === n} onClick={() => set({ ...cfg, shields: n })}>{n}</button>
          ))}
        </div>
      </div>

      <div className="statline">
        <span>CP <b>{st.cp}</b></span>
        <span>Lv <b>{build.level}</b></span>
        <span>攻 <b>{st.atk.toFixed(1)}</b></span>
        <span>防 <b>{st.def.toFixed(1)}</b></span>
        <span>HP <b>{st.hp}</b></span>
      </div>
    </div>
  );
}
