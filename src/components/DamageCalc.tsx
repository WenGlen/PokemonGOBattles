'use client';

import { useState } from 'react';
import { TypeIcon } from '@/components/Icon';
import MoveNums from '@/components/MoveNums';
import TypePicker from '@/components/TypePicker';
import { Marks } from '@/components/TypeMatrix';
import { isFast } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import { MULT, effBucket, effClass, effectiveness } from '@/lib/typeChart';
import { zhName } from '@/lib/types';

/** 同時比幾招 */
export const MAX_CALC = 3;

/**
 * 打擊計算。
 *
 * 左邊選一組防守屬性（不選就是 ×1），右邊從下面的招式表點進來最多三招，
 * 算這幾招打在那組屬性上的**有效威力** ＝ 威力 × 倍率（本系再 ×1.2）。
 *
 * 只算到有效威力就停：再往下的實際傷害要看攻守雙方的攻擊與防禦，
 * 那是對位的事（模擬器在做），不是「這一招打這組屬性有多痛」要回答的。
 *
 * 本系加成逐招自己開：三招的屬性不一樣，攻方是不是本系也就不一樣，
 * 一個全域開關會把三招一起算錯。
 *
 * @param picked 選進來的招式 id，順序就是點下去的順序
 * @param onRemove 把某一招拿掉
 */
export default function DamageCalc({ data, picked, onRemove }: {
  data: AppData;
  picked: string[];
  onRemove: (id: string) => void;
}) {
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  const [stab, setStab] = useState<string[]>([]);

  /** 同一個屬性選兩次等於單屬性 */
  const types = [...new Set([t1, t2].filter(Boolean))];
  const moves = picked.map((id) => data.moveById.get(id)).filter((m) => m !== undefined);
  const toggleStab = (id: string) =>
    setStab((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <section className="blk narrow dc">
      <div className="blk-head">
        <h3>打擊計算</h3>
      </div>

      <div className="dc-cols">
        <div className="dc-def">
          <span className="dc-label">防守屬性</span>
          <TypePicker value={t1} onChange={setT1} anyLabel="不限" title="挨打那一方的屬性" />
          <TypePicker value={t2} onChange={setT2} anyLabel="不限" title="只有一種屬性就留空" />
        </div>

        <div className="tbl-scroll full dc-list">
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">招式</th>
                <th title="這一招打在左邊那組屬性上的倍率">攻擊倍率</th>
                <th title="攻方自己也是這個屬性時 ×1.2">本系加成</th>
                <th title="威力 × 倍率，開本系再 ×1.2">有效威力</th>
                <th title="大招是每點能量的有效威力；快招沒有能量成本，看的是每回合">能量效率</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {moves.map((m) => {
                const eff = effectiveness(m.type, types);
                const on = stab.includes(m.id);
                const power = m.power * eff * (on ? MULT.STAB : 1);
                const fast = isFast(m);
                return (
                  <tr key={m.id}>
                    <td className="left nm nowrap">
                      <TypeIcon type={m.type} size={14} />
                      <span>{zhName(m)}</span>
                      <MoveNums m={m} ratios={false} />
                    </td>
                    <td className={`num ef-${effClass(eff)}`} title={`×${eff.toFixed(3)}`}>
                      {/* 這一欄講的是「打過去」，所以只有打得動才畫爆炸；
                          被擋下來是沒有記號的綠字，不要在攻擊欄畫盾牌 */}
                      <span className="dc-mult">
                        {effBucket(eff) > 0 && <Marks mult={eff} size={11} />}×{eff.toFixed(2)}
                      </span>
                    </td>
                    <td className="num">
                      <button
                        className={`bx-btn${on ? ' on' : ''}`}
                        aria-pressed={on}
                        title={on ? '算了本系加成，按一下取消' : '這一招對攻方是本系的話按下去，×1.2'}
                        onClick={() => toggleStab(m.id)}
                      >
                        {on ? '✓' : '＋'}
                      </button>
                    </td>
                    <td className="num dc-power">{power.toFixed(1)}</td>
                    {/* 快招沒有能量成本，所以那一格看的是每回合 */}
                    <td className="num dim" title={fast ? '每回合' : '每點能量'}>
                      {fast ? (power / m.turns).toFixed(2) : (power / m.energy).toFixed(2)}
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
            <div className="tbl-empty">點下面招式表的任一列加進來，最多三招</div>
          )}
        </div>
      </div>
    </section>
  );
}
