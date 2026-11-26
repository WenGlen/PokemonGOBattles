'use client';

import { BoltIcon, BurstIcon } from '@/components/Icon';
import { dpe, fastRates, isFast } from '@/lib/analysis';
import type { MoveData } from '@/lib/types';

/**
 * 一招的數值。整站只有這一份，寶可夢表、隊伍、對戰模擬都吃它。
 *
 * 順序固定成「威力 → 能量 → 時間 → 比值」：先看打多痛、再看多貴、
 * 再看要等多久，最後才是算出來的比值。
 * 威力與能量用圖示不寫字（「力」「⚡」各佔一格字寬卻只是標籤），
 * 回合數直接換成秒——遊戲裡感覺得到的是時間，不是回合。
 *
 * @param m 招式
 * @param ratios 要不要帶 Dpt／Ept／Dpe。表格裡的小字塞不下就關掉
 */
export default function MoveNums({ m, ratios = true }: { m: MoveData; ratios?: boolean }) {
  const fast = isFast(m);
  const r = fastRates(m);
  const buff = !fast && m.buffs && (m.buffs[0] || m.buffs[1])
    ? `${m.buffTarget === 'self' ? '自' : '敵'} ${[
        m.buffs[0] ? `攻${m.buffs[0] > 0 ? '+' : ''}${m.buffs[0]}` : '',
        m.buffs[1] ? `防${m.buffs[1] > 0 ? '+' : ''}${m.buffs[1]}` : '',
      ].filter(Boolean).join('、')}`
    : '';
  return (
    <span className="dim mv-nums">
      <BurstIcon size={11} />{m.power}
      <i>·</i>
      <BoltIcon size={11} />{fast ? `+${m.energyGain}` : m.energy}
      {fast && <><i>·</i>{(m.turns * 0.5).toFixed(1)} s</>}
      {ratios && (
        <>
          <i>·</i>
          {fast ? `Dpt ${r.dpt.toFixed(2)} · Ept ${r.ept.toFixed(2)}` : `Dpe ${dpe(m).toFixed(2)}`}
        </>
      )}
      {buff && <><i>·</i>{buff}</>}
    </span>
  );
}
