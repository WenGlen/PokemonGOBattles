'use client';

import { useState } from 'react';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import Radar from '@/components/Radar';
import TypeMatrix from '@/components/TypeMatrix';
import {
  dpe, fastRates, isFast, radarValues, roleTags,
  type RadarContext, type RadarValues, type RoleTag, type TagContext,
} from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import { zhName, type MoveData, type PokemonData } from '@/lib/types';

/**
 * 卡片要顯示的那一列數值。
 * 卡片從列表裡抽出來獨立之後，原本那一列的數字就跟著看不到了，所以一起帶進來。
 */
export interface DetailStats {
  rank: number | null;
  score: number | null;
  cp: number;
  level: number;
  atk: number;
  def: number;
  hp: number;
  /** 耐久 = 防禦 × HP */
  bulk: number;
  /** pvpoke 推薦的招式組合，用來在招式清單上標記 */
  moveset: string[] | null;
}

/** 招式清單裡的一列。推薦的那幾招放大，點一下就拿去算「出手」 */
function MoveRow({ m, rec, on, onPick }: {
  m: MoveData;
  rec: boolean;
  on: boolean;
  onPick: () => void;
}) {
  const fast = isFast(m);
  const r = fastRates(m);
  return (
    <button
      type="button"
      className={`pd-move${rec ? ' rec' : ''}${on ? ' on' : ''}`}
      aria-pressed={on}
      title={`點一下看 ${zhName(m)} 打每一種屬性的倍率`}
      onClick={onPick}
    >
      <TypeIcon type={m.type} size={rec ? 18 : 13} />
      <b>{zhName(m)}</b>
      <span className="dim">
        {fast
          ? `${m.power}力 · ${m.turns}回合 · ⚡+${m.energyGain} · DPT ${r.dpt.toFixed(2)} · EPT ${r.ept.toFixed(2)}`
          : `${m.power}力 · ⚡${m.energy} · DPE ${dpe(m).toFixed(2)}`}
        {!fast && m.buffs && (m.buffs[0] || m.buffs[1])
          ? ` · ${m.buffTarget === 'self' ? '自身' : '對手'} ${[
              m.buffs[0] ? `攻${m.buffs[0] > 0 ? '+' : ''}${m.buffs[0]}` : '',
              m.buffs[1] ? `防${m.buffs[1] > 0 ? '+' : ''}${m.buffs[1]}` : '',
            ].filter(Boolean).join('、')}`
          : ''}
      </span>
      {rec && <em>推薦</em>}
    </button>
  );
}

/**
 * 單隻寶可夢的解析卡。
 *
 * 左欄是「跟誰打有利」與「底子多好」，右欄是牠帶得出來的招。
 * 點右欄任何一招，左欄的屬性對照就換成那一招的結果——
 * 招式清單本來就在那裡，不用為了選招再多長一排按鈕出來。
 */
export default function PokemonDetail({ p, data, ctx, radarCtx, compare, st, onClose }: {
  p: PokemonData;
  data: AppData;
  ctx: TagContext;
  radarCtx: RadarContext;
  /** 同時開兩張卡時，另一隻的六個軸會疊成虛線，直接比形狀 */
  compare?: RadarValues | null;
  st: DetailStats;
  onClose: () => void;
}) {
  // 判斷依據直接顯示在標籤下面。原生 title 要等一秒才跳、手機完全不會跳，
  // 等於把算式藏起來；這裡改成滑過或點一下就寫在旁邊。
  const [why, setWhy] = useState<RoleTag | null>(null);
  const [mode, setMode] = useState<'def' | 'atk'>('def');
  const [pick, setPick] = useState<string | null>(null);

  const tags = roleTags(p, st, data.moveById, ctx);
  const fasts = p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const chargeds = p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const rec = new Set(st.moveset ?? []);
  const radar = radarValues(p, st, data.moveById);

  /** 點招式＝想看這一招打誰，所以順手切到出手；再點一次取消，回到「最好的那一招」 */
  function choose(id: string) {
    setPick((v) => (v === id ? null : id));
    setMode('atk');
  }

  return (
    <div className="pd">
      <div className="pd-head">
        <PokemonIcon key={p.icon} icon={p.icon} alt={zhName(p)} size={144} shadow={Boolean(p.shadow)} />
        <div className="pd-id">
          <h3>{zhName(p)}<small className="dim">#{p.dex}</small></h3>
          <div className="pd-ty">
            {p.types.map((t) => (
              <span key={t} className="chip type"><TypeIcon type={t} size={15} label /></span>
            ))}
          </div>
        </div>
        {tags.length > 0 && (
          <div className="pd-tagbox">
            <div className="pd-tags">
              {tags.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  className={`tag-pill ${t.tone}${why?.label === t.label ? ' on' : ''}`}
                  onMouseEnter={() => setWhy(t)}
                  onFocus={() => setWhy(t)}
                  onClick={() => setWhy((w) => (w?.label === t.label ? null : t))}
                >
                  <span className="tag-ico" aria-hidden>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
            {/* 依據就寫在標籤正下方，不用把視線拉到別的地方找 */}
            <p className="pd-why">
              {why
                ? <><b>{why.icon} {why.label}</b>：{why.why}</>
                : '滑過或點一下標籤，看它是怎麼算出來的'}
            </p>
          </div>
        )}
        <button type="button" className="panel-x" onClick={onClose} aria-label="收起這張卡">×</button>
      </div>

      <div className="pd-cols">
        <div className="pd-col">
          <TypeMatrix
            p={p}
            moveById={data.moveById}
            mode={mode}
            onMode={setMode}
            pick={pick}
          />

          <section className="pd-sec">
            <h4 title={`${st.level ? `Lv${st.level} · ` : ''}軸上是真實數值，顏色是強弱、位置是贏過同聯盟上榜的多少人`}>
              六角能力
            </h4>
            <div className="pd-radar">
              <Radar values={radar} ctx={radarCtx} compare={compare} />
              <dl className="pd-stats">
                <div>
                  <dt>排名</dt>
                  <dd>{st.rank ?? '—'}{st.score !== null && <small> 分 {st.score.toFixed(1)}</small>}</dd>
                </div>
                <div><dt>CP</dt><dd>{st.cp}</dd></div>
                <div><dt>耐久</dt><dd>{Math.round(st.bulk).toLocaleString()}</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <div className="pd-col">
          <section className="pd-sec">
            <h4 title="點一招，左邊的屬性對照就換成那一招打每一種屬性的結果">快招</h4>
            {fasts.length === 0 && <div className="pd-empty">—</div>}
            {fasts.map((m) => (
              <MoveRow key={m.id} m={m} rec={rec.has(m.id)} on={pick === m.id} onPick={() => choose(m.id)} />
            ))}
          </section>

          <section className="pd-sec">
            <h4 title="點一招，左邊的屬性對照就換成那一招打每一種屬性的結果">大招</h4>
            {chargeds.length === 0 && <div className="pd-empty">—</div>}
            {chargeds.map((m) => (
              <MoveRow key={m.id} m={m} rec={rec.has(m.id)} on={pick === m.id} onPick={() => choose(m.id)} />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
