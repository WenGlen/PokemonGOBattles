'use client';

import { useState } from 'react';
import { TypeIcon } from '@/components/Icon';
import MoveNums from '@/components/MoveNums';
import TypePicker from '@/components/TypePicker';
import { Marks } from '@/components/TypeMatrix';
import { isFast } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import { rawDamage } from '@/lib/battle';
import { effClass, effectiveness, TYPE_ZH } from '@/lib/typeChart';
import { zhName } from '@/lib/types';

/** 同時比幾招 */
export const MAX_CALC = 3;

/** 參考對位的攻防。超級聯盟的主流大致落在這附近，自己改也行 */
const DEF_ATK = 120;
const DEF_DEF = 120;

/** 輸入框只收正數，空字串先留著讓人刪得動 */
function num(v: string, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 打擊計算。
 *
 * 選一組防守屬性（不選就是 ×1），再從下面的招式表按 ＋ 丟最多三招進來，
 * 算這幾招打在那組屬性上的傷害。
 *
 * 傷害本身跟攻守雙方的攻擊／防禦有關，所以這裡給一組可以改的參考值，
 * 用的是對戰裡同一條公式（battle.ts 的 rawDamage），不另外寫一份。
 *
 * @param picked 選進來的招式 id，順序就是按下去的順序
 * @param onRemove 把某一招拿掉
 */
export default function DamageCalc({ data, picked, onRemove }: {
  data: AppData;
  picked: string[];
  onRemove: (id: string) => void;
}) {
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [atk, setAtk] = useState(String(DEF_ATK));
  const [def, setDef] = useState(String(DEF_DEF));
  const [stab, setStab] = useState(false);

  /** 同一個屬性選兩次等於單屬性 */
  const types = [...new Set([t1, t2].filter(Boolean))];
  const a = num(atk, DEF_ATK);
  const d = num(def, DEF_DEF);
  const moves = picked.map((id) => data.moveById.get(id)).filter((m) => m !== undefined);

  return (
    <section className="blk narrow dc">
      <div className="blk-head">
        <h3>打擊計算</h3>
        <div className="blk-tools">
          <button aria-pressed={stab} onClick={() => setStab((v) => !v)} title="攻方自己也是這個屬性時傷害 ×1.2">
            本系加成
          </button>
        </div>
      </div>

      <div className="dc-bar">
        <span className="dc-label">防守屬性</span>
        <TypePicker value={t1} onChange={setT1} anyLabel="不限" title="挨打那一方的屬性" />
        <TypePicker value={t2} onChange={setT2} anyLabel="不限" title="只有一種屬性就留空" />
        <span className="dc-label">攻擊</span>
        <input type="number" min={1} value={atk} onChange={(e) => setAtk(e.target.value)} title="攻方的實戰攻擊力" />
        <span className="dc-label">防禦</span>
        <input type="number" min={1} value={def} onChange={(e) => setDef(e.target.value)} title="守方的實戰防禦力" />
      </div>

      <div className="tbl-scroll full">
        <table className="tbl">
          <thead>
            <tr>
              <th className="left">招式</th>
              <th title="這一招打在上面那組屬性上的倍率">倍率</th>
              <th title="威力 × 倍率（開本系再 ×1.2），跟攻防無關，純比這一招打這組屬性有多痛">有效威力</th>
              <th title="照對戰公式算，用上面那組攻擊與防禦">傷害</th>
              <th title="快招看每回合、大招看每點能量">效率</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {moves.map((m) => {
              const eff = effectiveness(m.type, types);
              const power = m.power * eff * (stab ? 1.2 : 1);
              const dmg = rawDamage(m.power, a, d, eff, stab);
              const fast = isFast(m);
              return (
                <tr key={m.id}>
                  <td className="left nm nowrap">
                    <TypeIcon type={m.type} size={14} />
                    <span>{zhName(m)}</span>
                    <MoveNums m={m} ratios={false} />
                  </td>
                  <td className={`num ef-${effClass(eff)}`} title={`×${eff.toFixed(3)}`}>
                    <span className="dc-mult"><Marks mult={eff} size={11} />×{eff.toFixed(2)}</span>
                  </td>
                  <td className="num">{power.toFixed(1)}</td>
                  <td className="num dc-dmg">{dmg}</td>
                  <td className="num dim">
                    {fast
                      ? `${(dmg / m.turns).toFixed(1)}／回合`
                      : `${(dmg / m.energy).toFixed(2)}／能量`}
                  </td>
                  <td className="num">
                    <button className="bx-btn" title="從計算裡拿掉" onClick={() => onRemove(m.id)}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {moves.length === 0 && (
          <div className="tbl-empty">從下面的招式表按每一列右邊的 ＋ 加進來，最多三招</div>
        )}
      </div>
    </section>
  );
}
