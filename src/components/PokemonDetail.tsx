'use client';

import { useState } from 'react';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import {
  defenseProfile, dpe, fastRates, offenseProfile, roleTags,
  type RoleTag, type TagContext,
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
 * 一排屬性圖示。
 * 倍率本身看不出意思，所以標題下面一律附一行白話，不要求人滑過去才看得到。
 */
function TypeRow({ label, note, types, tone }: {
  label: string;
  note: string;
  types: string[];
  tone?: 'bad2' | 'bad' | 'good' | 'good2';
}) {
  return (
    <div className="pd-row">
      <span className={`pd-label${tone ? ` ${tone}` : ''}`}>
        {label}
        <small>{note}</small>
      </span>
      <span className="pd-types">
        {types.length
          ? types.map((t) => (
              <span key={t} className={`chip type${tone ? ` ${tone}` : ''}`}>
                <TypeIcon type={t} size={14} label />
              </span>
            ))
          : <span className="dim">無</span>}
      </span>
    </div>
  );
}

/**
 * 單隻寶可夢的解析卡。
 *
 * 左半是「這隻本身」——屬性挨打的狀況與三圍；
 * 右半是「這隻能做什麼」——招式打得動誰，以及實際帶得出來的招。
 * 防守面與攻擊面分開講，因為它們是兩件事：一隻可以很耐打但打不動人，也可以反過來。
 */
export default function PokemonDetail({ p, data, ctx, st, onClose }: {
  p: PokemonData;
  data: AppData;
  ctx: TagContext;
  st: DetailStats;
  onClose: () => void;
}) {
  // 判斷依據直接顯示在標籤下面。原生 title 要等一秒才跳、手機完全不會跳，
  // 等於把算式藏起來；這裡改成滑過或點一下就寫在旁邊。
  const [why, setWhy] = useState<RoleTag | null>(null);

  const def = defenseProfile(p.types);
  const off = offenseProfile(p, data.moveById);
  const tags = roleTags(p, st, data.moveById, ctx);

  const fasts = p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const chargeds = p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const rec = new Set(st.moveset ?? []);

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
                  {t.label}
                </button>
              ))}
            </div>
            {/* 依據就寫在標籤正下方，不用把視線拉到別的地方找 */}
            <p className="pd-why">
              {why
                ? <><b>{why.label}</b>：{why.why}</>
                : '滑過或點一下標籤，看它是怎麼算出來的'}
            </p>
          </div>
        )}
        <button type="button" className="panel-x" onClick={onClose} aria-label="收起這張卡">×</button>
      </div>

      <div className="pd-cols">
        <div className="pd-col">
          <section className="pd-sec">
            <h4>挨打（這隻的屬性）</h4>
            <TypeRow label="×2.56" note="雙重被剋" types={def.weak2} tone="bad2" />
            <TypeRow label="×1.60" note="被剋" types={def.weak} tone="bad" />
            <TypeRow label="×0.63" note="抵抗" types={def.resist} tone="good" />
            <TypeRow label="×0.39" note="雙抗或免疫" types={def.resist2} tone="good2" />
          </section>

          <section className="pd-sec">
            <h4>基本數值（{st.level ? `Lv${st.level} · ` : ''}這個聯盟的實戰值）</h4>
            <dl className="pd-stats">
              <div>
                <dt>排名</dt>
                <dd>{st.rank ?? '—'}{st.score !== null && <small> 分 {st.score.toFixed(1)}</small>}</dd>
              </div>
              <div><dt>CP</dt><dd>{st.cp}</dd></div>
              <div><dt>耐久</dt><dd>{Math.round(st.bulk).toLocaleString()}</dd></div>
              <div><dt>攻擊</dt><dd>{st.atk.toFixed(1)}</dd></div>
              <div><dt>防禦</dt><dd>{st.def.toFixed(1)}</dd></div>
              <div><dt>HP</dt><dd>{st.hp}</dd></div>
            </dl>
          </section>
        </div>

        <div className="pd-col">
          <section className="pd-sec">
            <h4>出手（這隻的招式打得動誰）</h4>
            <TypeRow label="打得痛" note="≥ 1.6 倍" types={off.strong} tone="good" />
            <TypeRow label="打不動" note="所有招都被吃" types={off.weak} tone="bad" />
            <TypeRow label="能帶的屬性" note="招式覆蓋面" types={off.coverage} />
          </section>

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
