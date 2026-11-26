'use client';

import { useState } from 'react';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import MoveNums from '@/components/MoveNums';
import Radar from '@/components/Radar';
import TypeMatrix from '@/components/TypeMatrix';
import {
  radarValues, roleTags,
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
      <MoveNums m={m} />
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
  /**
   * 標籤的依據要顯示哪一個。
   *
   * 滑過是暫時的、點一下是釘住的，兩個分開存——
   * 合成一個的話，滑過已經填進去之後再點同一個，toggle 會把它清掉，
   * 看起來就像「點了反而不見」。
   */
  const [pinned, setPinned] = useState<RoleTag | null>(null);
  const [hoverTag, setHoverTag] = useState<RoleTag | null>(null);
  const why = hoverTag ?? pinned;
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
      <button type="button" className="panel-x" onClick={onClose} aria-label="收起這張卡">×</button>

      {/* 上半分兩欄：左邊是「牠是誰」，右邊是「牠怕什麼」 */}
      <div className="pd-top">
        <div className="pd-who">
          <div className="pd-head">
            <PokemonIcon key={p.icon} icon={p.icon} alt={zhName(p)} size={144} shadow={Boolean(p.shadow)} />
            <div className="pd-id">
              <h3>{zhName(p)}<small className="dim">#{p.dex}</small></h3>
              <div className="pd-ty">
                {p.types.map((t) => (
                  <span key={t} className="chip type"><TypeIcon type={t} size={15} label /></span>
                ))}
              </div>
              {/* 名次貼齊頭像的下緣，跟屬性之間自然留出一段距離 */}
              <div className="pd-rank" title="pvpoke 在這個聯盟的總排名與評分">
                {st.rank === null
                  ? <span className="dim">未上榜</span>
                  : <>第 <b>{st.rank}</b> 名{st.score !== null && <small>· {st.score.toFixed(1)} 分</small>}</>}
              </div>
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
                    onMouseEnter={() => setHoverTag(t)}
                    onMouseLeave={() => setHoverTag(null)}
                    onFocus={() => setHoverTag(t)}
                    onBlur={() => setHoverTag(null)}
                    onClick={() => setPinned((w) => (w?.label === t.label ? null : t))}
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
                  : '滑過或點擊可看標籤說明'}
              </p>
            </div>
          )}
        </div>

        <TypeMatrix types={p.types} atk={atk} />
      </div>

      <div className="pd-cols">
        <div className="pd-col">
          <section className="pd-sec">
            <h4 title={`${st.level ? `Lv${st.level} · ` : ''}軸上是真實數值，顏色是強弱、位置是贏過同聯盟上榜的多少人`}>
              能力數值
              {/* CP 不是能力的一部分（它是等級與 IV 的結果），所以掛在標題旁邊不佔軸 */}
              <span className="pd-cp">CP {st.cp}</span>
            </h4>
            <div className="pd-radar">
              <Radar values={radar} ctx={radarCtx} compare={compare} />
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
