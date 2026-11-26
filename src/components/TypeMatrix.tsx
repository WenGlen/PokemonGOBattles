'use client';

import { TypeIcon } from '@/components/Icon';
import { ALL_TYPES } from '@/lib/analysis';
import { effBucket, effClass, effectiveness, TYPE_ZH } from '@/lib/typeChart';
import { zhName, type MoveData } from '@/lib/types';

/** 外框要照哪一招畫；strong 是滑過（比選取更粗） */
export interface AtkFocus {
  move: MoveData;
  strong: boolean;
}

/**
 * 十八屬性克制表。
 *
 * 一格同時講兩件事，用兩種編碼分開：
 *   **底色與數字**＝這隻挨那個屬性的倍率（防守面，永遠在）
 *   **外框**＝滑過／選到的那一招打那個屬性的倍率（攻擊面，跟著招式走）
 *
 * 兩面共用同一套顏色（見 effClass）：紅橘＝倍率高、綠藍＝倍率低。
 *
 * 兩面本來就是獨立的兩件事，用切換會看不到關係；
 * 一個填色一個描邊就能同時看，而且外框用 outline 不是 border——
 * outline 不占位置，粗細變化不會讓十八格跟著位移。
 *
 * @param types 防守方的屬性（1 或 2 個）
 * @param atk 要畫外框的那一招，null 就是純防守面
 */
export default function TypeMatrix({ types, atk }: { types: string[]; atk: AtkFocus | null }) {
  return (
    <section className="tm">
      <div className="tm-bar">
        <h4 title="底色與數字是這隻挨打的倍率；滑過或點右邊的招式，外框會畫出那一招打得動誰">
          屬性克制
        </h4>
        {atk && (
          <span className="tm-hint">
            外框：<b>{zhName(atk.move)}</b> 打出去的倍率
          </span>
        )}
      </div>

      <div className="tm-grid">
        {ALL_TYPES.map((t) => {
          const def = effectiveness(t, types);
          const fill = effClass(effBucket(def));

          const hit = atk ? effectiveness(atk.move.type, [t]) : null;
          const line = hit === null ? '' : effClass(effBucket(hit));

          return (
            <div
              key={t}
              className={`tm-cell${fill ? ' ef-' + fill : ''}${line ? ' o-' + line : ''}${atk?.strong ? ' hot' : ''}`}
              title={
                hit === null
                  ? `挨 ${TYPE_ZH[t]} ×${def.toFixed(2)}`
                  : `挨 ${TYPE_ZH[t]} ×${def.toFixed(2)}　${zhName(atk!.move)} 打 ${TYPE_ZH[t]} ×${hit.toFixed(2)}`
              }
            >
              <TypeIcon type={t} size={16} />
              <span className="tm-name">{TYPE_ZH[t]}</span>
              <b>×{def.toFixed(2)}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
