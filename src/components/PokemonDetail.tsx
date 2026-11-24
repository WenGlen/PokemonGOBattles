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

/**
 * 單隻寶可夢的解析卡。
 *
 * 由上而下：這是誰（頭像、定位標籤）→ 該帶什麼（推薦招式）→
 * 跟誰打有利（屬性對照）→ 底子多好（雷達圖）→ 還能帶什麼（招式清單）。
 * 防守面與攻擊面在屬性對照裡用切換分開，因為它們是兩件事：
 * 一隻可以很耐打但打不動人，也可以反過來。
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

  const tags = roleTags(p, st, data.moveById, ctx);

  const fasts = p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const chargeds = p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const rec = new Set(st.moveset ?? []);
  /** pvpoke 推薦的那一組，照快招、大招 1、大招 2 的順序 */
  const recMoves = (st.moveset ?? [])
    .map((id) => data.moveById.get(id))
    .filter(Boolean) as MoveData[];
  const radar = radarValues(p, st, data.moveById);

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

      {recMoves.length > 0 && (
        <section className="pd-rec-bar">
          <h4>推薦招式<span>pvpoke 在這個聯盟算出來的組合</span></h4>
          <div className="pd-rec-set">
            {recMoves.map((m) => {
              const fast = isFast(m);
              const r = fastRates(m);
              return (
                <div key={m.id} className={`pd-rec-card${fast ? ' fast' : ''}`}>
                  <TypeIcon type={m.type} size={22} />
                  <div>
                    <b>{zhName(m)}</b>
                    <span>
                      {fast
                        ? `${m.power}力 · ${m.turns}回合 · ⚡+${m.energyGain} · DPT ${r.dpt.toFixed(2)}`
                        : `${m.power}力 · ⚡${m.energy} · DPE ${dpe(m).toFixed(2)}`}
                    </span>
                  </div>
                  <em>{fast ? '快招' : '大招'}</em>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <TypeMatrix p={p} moveById={data.moveById} />

      <div className="pd-cols">
        <div className="pd-col">
          <section className="pd-sec">
            <h4>六角能力（{st.level ? `Lv${st.level} · ` : ''}跟同聯盟上榜的比）</h4>
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
            <p className="pd-radar-note">
              軸上寫的是真實數值，<b>顏色是強弱、位置是贏過同聯盟多少人</b>——
              六個軸單位不同，只有百分位放得進同一張圖。
              {compare && ' 虛線是另一張卡那一隻。'}
            </p>
          </section>
        </div>

        <div className="pd-col">
          <section className="pd-sec">
            <h4>快招</h4>
            {fasts.length === 0 && <div className="pd-empty">—</div>}
            {fasts.map((m) => {
              const r = fastRates(m);
              return (
                <div key={m.id} className="pd-move">
                  <TypeIcon type={m.type} size={13} />
                  <b>{zhName(m)}</b>
                  {rec.has(m.id) && <span className="pd-rec">推薦</span>}
                  <span className="dim">
                    {m.power}力 · {m.turns}回合 · ⚡+{m.energyGain} · DPT {r.dpt.toFixed(2)} · EPT {r.ept.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </section>

          <section className="pd-sec">
            <h4>大招</h4>
            {chargeds.length === 0 && <div className="pd-empty">—</div>}
            {chargeds.map((m) => (
              <div key={m.id} className="pd-move">
                <TypeIcon type={m.type} size={13} />
                <b>{zhName(m)}</b>
                {rec.has(m.id) && <span className="pd-rec">推薦</span>}
                <span className="dim">
                  {m.power}力 · ⚡{m.energy} · DPE {dpe(m).toFixed(2)}
                  {m.buffs && (m.buffs[0] || m.buffs[1])
                    ? ` · ${m.buffTarget === 'self' ? '自身' : '對手'} ${[
                        m.buffs[0] ? `攻${m.buffs[0] > 0 ? '+' : ''}${m.buffs[0]}` : '',
                        m.buffs[1] ? `防${m.buffs[1] > 0 ? '+' : ''}${m.buffs[1]}` : '',
                      ].filter(Boolean).join('、')}`
                    : ''}
                </span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
