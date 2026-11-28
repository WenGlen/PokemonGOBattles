'use client';

/**
 * 數值底下的細長條，拿同一欄目前最高的當 100%。
 *
 * 右邊對齊是為了跟右對齊的數字共用同一條邊，掃一眼就比得出長短；
 * 最小留 2% 才不會讓小數值看起來像沒有。
 * 每 20% 換一個顏色（紅→橙→黃→黃綠→綠），長度相近時用顏色補一刀；
 * 顏色是長度的重複編碼，不是唯一資訊，所以色覺差異不影響判讀。
 *
 * @param v 這一列的值
 * @param max 這一欄目前的最大值
 * @param invert 長度照舊，顏色反過來。
 *   大招的能量是成本，越便宜越好，拿同一套「越長越綠」會講反話
 */
export default function Bar({ v, max, invert = false }: { v: number; max: number; invert?: boolean }) {
  const ratio = v / max;
  // [0,20) 是第 1 段…[80,100] 是第 5 段；剛好 100% 會算成第 6 段，夾回來
  const band = Math.min(5, Math.floor((invert ? 1 - ratio : ratio) * 5) + 1);
  return (
    <span className="bar" aria-hidden="true">
      <i className={`b${band}`} style={{ width: `${Math.max(2, ratio * 100).toFixed(1)}%` }} />
    </span>
  );
}
