'use client';

import { useEffect, useRef } from 'react';
import PokemonDetail from '@/components/PokemonDetail';
import { radarValues, type RadarContext, type TagContext } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import type { MonRow } from '@/lib/rows';

/** 同時能攤開幾隻來比 */
export const MAX_PICKED = 2;

/**
 * 點開的解析卡。
 *
 * 卡片放在表格上面而不是插在列中間：卡片不跟著列表捲動，
 * 所以可以一邊翻表一邊對照，最多同時放兩隻比較。
 * 寶可夢表與屬性表共用這一塊，兩邊的互動才會一模一樣。
 *
 * @param deck 要攤開的那幾列，順序就是點選順序
 * @param onClose 關掉其中一張
 */
export default function MonDeck({ deck, data, tagCtx, radarCtx, onClose }: {
  deck: MonRow[];
  data: AppData;
  tagCtx: TagContext;
  radarCtx: RadarContext;
  onClose: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** 只有「開著哪幾隻」變了才捲，捲動條件不該跟著其他 state 重跑 */
  const ids = deck.map((r) => r.p.id).join(',');

  // 卡片在表格上面，列表捲到一半點新的一隻時卡片可能在畫面外；
  // nearest 只在真的看不到時才捲，已經看得到就不動。
  useEffect(() => {
    if (ids) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ids]);

  if (!deck.length) return null;

  return (
    <div ref={ref} className="pd-deckwrap">
      <div className={`pd-deck${deck.length > 1 ? ' two' : ''}`}>
        {deck.map((r, i) => {
          // 兩張卡同時開著的時候，各自把對方疊成虛線，一眼看出誰的形狀大
          const other = deck.length === 2 ? deck[1 - i] : null;
          return (
            <PokemonDetail
              key={r.p.id}
              p={r.p}
              data={data}
              ctx={tagCtx}
              radarCtx={radarCtx}
              compare={other ? radarValues(other.p, other, data.moveById) : null}
              st={{
                rank: r.rank, score: r.score, cp: r.cp, level: r.level,
                atk: r.atk, def: r.def, hp: r.hp, bulk: r.bulk, moveset: r.moveset,
              }}
              onClose={() => onClose(r.p.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
