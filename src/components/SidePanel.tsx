'use client';

import Combo from '@/components/Combo';
import MovePicker from '@/components/MovePicker';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import type { AppData, SideConfig } from '@/lib/app-data';
import { battleStats, suggestedBuild, type LeagueCp } from '@/lib/stats';
import { zhName, type MoveData } from '@/lib/types';

/**
 * 一隻寶可夢的設定面板：選隻、選招、選盾。
 * 模擬器的兩側與對戰組合表的三隻都用這個，免得兩邊各做一套。
 *
 * @param title 面板標題
 * @param cls 額外的 class，用來上我方／對手的顏色
 * @param compact 對戰組合表要同時放三隻，版面壓縮一點
 */
export default function SidePanel({
  title, cls, cfg, set, data, cp, compact = false, onRemove,
}: {
  title: string;
  cls?: string;
  cfg: SideConfig;
  set: (c: SideConfig) => void;
  data: AppData;
  cp: LeagueCp;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const p = data.monById.get(cfg.id);
  if (!p) return null;
  const build = suggestedBuild(p, cp);
  const st = battleStats(p.stats, build.ivs, build.level, Boolean(p.shadow));

  return (
    <div className={`panel${cls ? ' ' + cls : ''}${compact ? ' compact' : ''}`}>
      {/* 圖片在左、名字那一欄在右：標題 → 選單 → 屬性。
          選單旁邊就是大圖，所以選完只留名字，不再放一次小圖 */}
      <div className="panel-id">
        <PokemonIcon key={p.icon} icon={p.icon} alt={zhName(p)} size={compact ? 66 : 84} shadow={Boolean(p.shadow)} />
        <div className="panel-idtxt">
          <h2>
            {title}
            {onRemove && <button className="panel-x" onClick={onRemove} title="移除">×</button>}
          </h2>
          <Combo list={data.listFor(cp)} value={cfg.id} onChange={(id) => set(data.defaultsFor(id, cp))} showPic={false} />
          <div className="chips">
            {p.types.map((t) => <span key={t} className="chip type"><TypeIcon type={t} size={15} label /></span>)}
            {p.shadow && <span className="chip">暗影</span>}
          </div>
        </div>
      </div>

      <div className="field">
        <label>快招</label>
        <MovePicker
          fast
          moves={p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[]}
          value={cfg.fast}
          onChange={(id) => id && set({ ...cfg, fast: id })}
        />
      </div>

      {[0, 1].map((slot) => (
        <div className="field" key={slot}>
          <label>大招 {slot + 1}</label>
          <MovePicker
            allowEmpty={slot === 1}
            moves={p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[]}
            value={cfg.charged[slot]}
            onChange={(id) => {
              const next: [string, string | null] = [...cfg.charged] as [string, string | null];
              next[slot] = id;
              set({ ...cfg, charged: next });
            }}
          />
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
