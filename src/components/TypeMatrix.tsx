'use client';

import { BurstIcon, ShieldIcon, TypeIcon } from '@/components/Icon';
import { ALL_TYPES } from '@/lib/analysis';
import { effClass, effMarks, effectiveness, TYPE_ZH } from '@/lib/typeChart';
import { zhName, type MoveData } from '@/lib/types';

/** 外框要照哪一招畫；strong 是滑過（比選取更粗） */
export interface AtkFocus {
  move: MoveData;
  strong: boolean;
}

/**
 * 倍率的記號：被剋畫爆炸、抵抗畫盾牌，一級一個、兩級兩個。
 * @param mult 倍率
 * @param size 單個記號的邊長 px
 */
function Marks({ mult, size = 13 }: { mult: number; size?: number }) {
  const { kind, count } = effMarks(mult);
  if (!kind) return null;
  const Ico = kind === 'burst' ? BurstIcon : ShieldIcon;
  return (
    <span className="tm-mk">
      {Array.from({ length: count }, (_, i) => <Ico key={i} size={size} />)}
    </span>
  );
}

/**
 * 十八屬性克制表。
 *
 * 一格同時講兩件事，用兩種編碼分開：
 *   **底色與記號**＝這隻挨那個屬性的倍率（防守面，永遠在）
 *   **外框**＝滑過／選到的那一招打那個屬性的倍率（攻擊面，跟著招式走）
 *
 * 兩面本來就是獨立的兩件事，用切換會看不到關係；
 * 一個填色一個描邊就能同時看，而且外框用 outline 不是 border——
 * outline 不占位置，粗細變化不會讓十八格跟著位移。
 *
 * 兩面共用同一套顏色（見 effClass）：紅橘＝倍率高、綠藍＝倍率低。
 *
 * 格子裡不寫倍率。十八個 ×1.00、×0.63 排在一起只會互相干擾，
 * 數字改放在**格子底下的圖例**上講一次；圖例只列真的出現的那幾段，
 * 精確值（×0.391 之類）留在滑過格子的 tooltip 裡。
 *
 * 沒有標題——它就擺在寶可夢旁邊，十八個屬性圖示自己說得清楚是什麼。
 *
 * @param types 防守方的屬性（1 或 2 個）
 * @param atk 要畫外框的那一招，null 就是純防守面
 */
export default function TypeMatrix({ types, atk }: { types: string[]; atk: AtkFocus | null }) {
  const cells = ALL_TYPES.map((t) => ({
    t,
    def: effectiveness(t, types),
    hit: atk ? effectiveness(atk.move.type, [t]) : null,
  }));

  // 圖例由重到輕，而且只列這張表真的出現的倍率——沒有雙重弱點就不用解釋兩個爆炸。
  // 去重要照「印出來的樣子」：0.625 與 1.6×0.390625 是兩個不同的浮點數，
  // 但都印成 ×0.63，直接拿數值去重會讓同一段出現兩次（例如巨鍛匠的鋼／妖精）
  const legend = [...new Map(
    cells
      .filter((c) => effClass(c.def) !== '')
      .map((c) => [`${effClass(c.def)}|${c.def.toFixed(2)}`, c.def] as const)
  ).values()].sort((a, b) => b - a);

  return (
    <section className="tm">
      <div className="tm-grid">
        {cells.map(({ t, def, hit }) => {
          const fill = effClass(def);
          const line = hit === null ? '' : effClass(hit);
          return (
            <div
              key={t}
              className={`tm-cell${fill ? ' ef-' + fill : ''}${line ? ' o-' + line : ''}${atk?.strong ? ' hot' : ''}`}
              title={
                hit === null
                  ? `挨 ${TYPE_ZH[t]} ×${def.toFixed(3)}`
                  : `挨 ${TYPE_ZH[t]} ×${def.toFixed(3)}　${zhName(atk!.move)} 打 ${TYPE_ZH[t]} ×${hit.toFixed(3)}`
              }
            >
              <TypeIcon type={t} size={16} />
              <span className="tm-name">{TYPE_ZH[t]}</span>
              <Marks mult={def} />
            </div>
          );
        })}
      </div>

      <div className="tm-bar">
        {atk && <span className="tm-hint">外框為招式倍率</span>}
        <div className="tm-legend">
          {legend.map((m) => (
            <span key={m} className={`tm-lg ef-${effClass(m)}`}>
              <Marks mult={m} size={12} />×{m.toFixed(2)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
