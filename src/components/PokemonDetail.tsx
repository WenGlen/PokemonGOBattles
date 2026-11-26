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

/** 招式清單裡的一列。推薦的那幾招放大；滑過或點一下就把克制表的外框換成這一招 */
function MoveRow({ m, rec, on, onPick, onHover }: {
  m: MoveData;
  rec: boolean;
  on: boolean;
  onPick: () => void;
  onHover: (hovering: boolean) => void;
}) {
  const fast = isFast(m);
  const r = fastRates(m);
  return (
    <button
      type="button"
      className={`pd-move${rec ? ' rec' : ''}${on ? ' on' : ''}`}
      aria-pressed={on}
      title={`滑過或點一下，左邊的克制表外框會換成 ${zhName(m)} 打出去的倍率`}
      onClick={onPick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
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
 * 屬性克制整排撐滿，下面左邊是六角能力、右邊是牠帶得出來的招。
 * 滑過或點右下任何一招，克制表的外框就換成那一招打出去的倍率——
 * 底色講防守、外框講攻擊，兩件事同時看得到，不用切換。
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
  /** 選到的招式（留著），以及正在滑過的那一招（暫時蓋過選取的） */
  const [pick, setPick] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const tags = roleTags(p, st, data.moveById, ctx);
  const fasts = p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const chargeds = p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const rec = new Set(st.moveset ?? []);
  const radar = radarValues(p, st, data.moveById);

  /** 滑過的優先，放開就回到選取的那一招；都沒有就是純防守面 */
  const focusId = hover ?? pick;
  const focusMove = focusId ? data.moveById.get(focusId) ?? null : null;
  const atk = focusMove ? { move: focusMove, strong: hover !== null } : null;

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
          {/* 排名是這張表的頭條事實，放在名字旁邊而不是擠進雷達圖旁邊的角落 */}
          <div className="pd-rank" title="pvpoke 在這個聯盟的總排名與評分">
            {st.rank === null
              ? <span className="dim">未上榜</span>
              : <>第 <b>{st.rank}</b> 名{st.score !== null && <small>· {st.score.toFixed(1)} 分</small>}</>}
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

      <TypeMatrix types={p.types} atk={atk} />

      <div className="pd-cols">
        <div className="pd-col">
          <section className="pd-sec">
            <h4 title={`${st.level ? `Lv${st.level} · ` : ''}軸上是真實數值，顏色是強弱、位置是贏過同聯盟上榜的多少人`}>
              六角能力
            </h4>
            <div className="pd-radar">
              <Radar values={radar} ctx={radarCtx} compare={compare} />
              {/* 雷達圖沒有的兩個數字擺在圖的下緣左右，中間的空間全留給圖 */}
              <dl className="pd-stats">
                <div><dt>CP</dt><dd>{st.cp}</dd></div>
                <div><dt>耐久</dt><dd>{Math.round(st.bulk).toLocaleString()}</dd></div>
              </dl>
            </div>
          </section>
        </div>

        <div className="pd-col">
          <section className="pd-sec">
            <h4 title="滑過或點一招，上面的克制表外框會換成那一招打出去的倍率">快招</h4>
            {fasts.length === 0 && <div className="pd-empty">—</div>}
            {fasts.map((m) => (
              <MoveRow
                key={m.id}
                m={m}
                rec={rec.has(m.id)}
                on={pick === m.id}
                onPick={() => setPick((v) => (v === m.id ? null : m.id))}
                onHover={(h) => setHover(h ? m.id : null)}
              />
            ))}
          </section>

          <section className="pd-sec">
            <h4 title="滑過或點一招，上面的克制表外框會換成那一招打出去的倍率">大招</h4>
            {chargeds.length === 0 && <div className="pd-empty">—</div>}
            {chargeds.map((m) => (
              <MoveRow
                key={m.id}
                m={m}
                rec={rec.has(m.id)}
                on={pick === m.id}
                onPick={() => setPick((v) => (v === m.id ? null : m.id))}
                onHover={(h) => setHover(h ? m.id : null)}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
