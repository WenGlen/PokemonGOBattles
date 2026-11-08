'use client';

import { TypeIcon } from '@/components/Icon';
import {
  defenseProfile, dpe, fastRates, offenseProfile, roleTags, type TagContext,
} from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import { TYPE_ZH } from '@/lib/typeChart';
import { zhName, type MoveData, type PokemonData } from '@/lib/types';

/** 一排屬性圖示；空的時候講清楚「沒有」而不是留白 */
function TypeRow({ label, types, tone, hint }: {
  label: string;
  types: string[];
  tone: 'bad2' | 'bad' | 'good' | 'good2';
  hint?: string;
}) {
  return (
    <div className="pd-row">
      <span className={`pd-label ${tone}`} title={hint}>{label}</span>
      <span className="pd-types">
        {types.length
          ? types.map((t) => (
              <span key={t} className={`chip type ${tone}`}><TypeIcon type={t} size={14} label /></span>
            ))
          : <span className="dim">無</span>}
      </span>
    </div>
  );
}

/**
 * 單隻寶可夢的解析：屬性攻防優劣、招式覆蓋、定位標籤。
 *
 * 防守面與攻擊面分開講，因為它們是兩件事——
 * 一隻可以很耐打但打不動人，也可以反過來。
 */
export default function PokemonDetail({ p, data, ctx, st }: {
  p: PokemonData;
  data: AppData;
  ctx: TagContext;
  st: { atk: number; def: number; hp: number };
}) {
  const def = defenseProfile(p.types);
  const off = offenseProfile(p, data.moveById);
  const tags = roleTags(p, st, data.moveById, ctx);

  const fasts = p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];
  const chargeds = p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[];

  return (
    <div className="pd">
      {tags.length > 0 && (
        <div className="pd-tags">
          {tags.map((t) => (
            <span key={t.label} className={`tag-pill ${t.tone}`} title={t.why}>{t.label}</span>
          ))}
          <span className="dim sm">標籤滑過去看判斷依據</span>
        </div>
      )}

      <div className="pd-cols">
        <div className="pd-col">
          <h4>挨打（這隻的屬性）</h4>
          <TypeRow label="×2.56" types={def.weak2} tone="bad2" hint="雙重被剋，一發就很痛" />
          <TypeRow label="×1.60" types={def.weak} tone="bad" hint="被剋" />
          <TypeRow label="×0.63" types={def.resist} tone="good" hint="抵抗" />
          <TypeRow label="×0.39" types={def.resist2} tone="good2" hint="雙重抵抗或免疫" />
        </div>

        <div className="pd-col">
          <h4>出手（這隻的招式打得動誰）</h4>
          <TypeRow
            label="打得痛"
            types={off.strong}
            tone="good"
            hint="牠最好的一招對這些屬性打出 1.2 倍以上（含本系加成）"
          />
          <TypeRow
            label="打不動"
            types={off.weak}
            tone="bad"
            hint="牠所有的招打這些屬性都會被吃掉，換上去前要先想清楚"
          />
          <div className="pd-row">
            <span className="pd-label">能帶的屬性</span>
            <span className="pd-types">
              {off.coverage.map((t) => (
                <span key={t} className="chip type"><TypeIcon type={t} size={14} label /></span>
              ))}
            </span>
          </div>
        </div>
      </div>

      <div className="pd-moves">
        <div>
          <h4>快招</h4>
          {fasts.map((m) => {
            const r = fastRates(m);
            return (
              <div key={m.id} className="pd-move">
                <TypeIcon type={m.type} size={13} />
                <b>{zhName(m)}</b>
                <span className="dim">
                  {m.power}力 · {m.turns}回合 · ⚡+{m.energyGain} · DPT {r.dpt.toFixed(2)} · EPT {r.ept.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
        <div>
          <h4>大招</h4>
          {chargeds.map((m) => (
            <div key={m.id} className="pd-move">
              <TypeIcon type={m.type} size={13} />
              <b>{zhName(m)}</b>
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
        </div>
      </div>

      <p className="pd-note">
        「打得痛／打不動」算的是對<b>單屬性</b>對手的結果，實戰遇到雙屬性還要再乘一次；
        完整的相剋關係在對戰組合表裡按整隊看。
      </p>
    </div>
  );
}
