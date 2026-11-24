'use client';

import { TypeIcon } from '@/components/Icon';
import { ALL_TYPES } from '@/lib/analysis';
import { effBucket, effectiveness, TYPE_ZH } from '@/lib/typeChart';
import { zhName, type MoveData, type PokemonData } from '@/lib/types';

export type MatrixMode = 'def' | 'atk';

/**
 * 十八屬性對照表。
 *
 * 四桶倍率列成四行字看久了沒感覺，改成十八格一次攤開：
 * 格子的底色與數字大小就是倍率本身，不用先讀完字才知道哪個嚴重。
 *
 * 挨打＝這隻挨每一種屬性的倍率；
 * 出手＝點右邊招式清單的某一招就換成「這一招打每一種屬性」，
 * 不點就看所有招裡最好的那一招。選招用的是本來就在的那份清單，
 * 不另外長一排按鈕出來把下面的東西往下推。
 *
 * @param mode 哪一面，由卡片持有，因為點招式也要能切過來
 * @param pick 選到的招式 id，null 代表看最好的那一招
 */
export default function TypeMatrix({ p, moveById, mode, onMode, pick }: {
  p: PokemonData;
  moveById: Map<string, MoveData>;
  mode: MatrixMode;
  onMode: (m: MatrixMode) => void;
  pick: string | null;
}) {
  const moves = [...p.fast, ...p.charged]
    .map((id) => moveById.get(id))
    .filter(Boolean) as MoveData[];
  const picked = pick ? moves.find((m) => m.id === pick) ?? null : null;

  /** 每一格要顯示什麼：倍率，以及出手模式下是靠哪一招打出來的 */
  const cellFor = (target: string): { mult: number; via: MoveData | null } => {
    if (mode === 'def') return { mult: effectiveness(target, p.types), via: null };
    if (picked) return { mult: effectiveness(picked.type, [target]), via: picked };
    let best: { mult: number; via: MoveData | null } = { mult: 0, via: null };
    for (const m of moves) {
      const mult = effectiveness(m.type, [target]);
      if (mult > best.mult) best = { mult, via: m };
    }
    return best.via ? best : { mult: 1, via: null };
  };

  /**
   * 同一個倍率在兩個模式下是相反的好事壞事：
   * 挨打挨得重是壞消息，出手打得重是好消息。顏色一律照「對你好不好」給。
   */
  const toneFor = (mult: number): string => {
    const b = effBucket(mult);
    if (b === 0) return '';
    const good = mode === 'atk' ? b > 0 : b < 0;
    const strong = Math.abs(b) >= 2;
    return `${good ? 'good' : 'bad'}${strong ? '2' : ''}`;
  };

  return (
    <section className="tm">
      <div className="tm-bar">
        <h4>屬性對照</h4>
        <div className="tm-modes">
          <button
            aria-pressed={mode === 'def'}
            title="這隻挨每一種屬性的倍率"
            onClick={() => onMode('def')}
          >挨打</button>
          <button
            aria-pressed={mode === 'atk'}
            title="牠的招打每一種屬性的倍率。算的是單屬性對手，實戰遇到雙屬性要再乘一次"
            onClick={() => onMode('atk')}
          >出手</button>
        </div>
        {mode === 'atk' && (
          <span className="tm-hint">{picked ? zhName(picked) : '最好的那一招'}</span>
        )}
      </div>

      <div className="tm-grid">
        {ALL_TYPES.map((t) => {
          const { mult, via } = cellFor(t);
          const tone = toneFor(mult);
          return (
            <div
              key={t}
              className={`tm-cell${tone ? ' ' + tone : ''}`}
              title={via ? `靠 ${zhName(via)} 打出 ×${mult.toFixed(2)}` : `×${mult.toFixed(2)}`}
            >
              <TypeIcon type={t} size={16} />
              <span className="tm-name">{TYPE_ZH[t]}</span>
              <b>×{mult.toFixed(2)}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
