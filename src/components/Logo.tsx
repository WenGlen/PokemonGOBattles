'use client';

import { useId, type ReactNode } from 'react';

/** 盾形外框：平肩尖頂，兩側直下再收成盾尖 */
const SHIELD =
  'M32 5.87 53.87 14.4V30.67c0 13.07-9.07 23.73-21.87 27.47C19.2 54.4 10.13 43.73 10.13 30.67V14.4Z';

/** 紅白交界、黑帶與中心鈕的共同中心。壓在盾最寬的那一段上 */
const EQ = 31.5;

/**
 * 球色是遊戲裡那四顆球的顏色，**不是站上的調色盤**。
 * 站徽不該跟著克制色或主題色變——那些調整了，標記就不是同一個標記。
 * 黑與紅剛好跟 --text、--ef-w2 同值，是巧合不是相依。
 */
const INK = '#2b2720';
const PAPER = '#ffffff';

export type Ball = 'poke' | 'great' | 'ultra' | 'master';

/**
 * 盾的上半邊：四顆球只差在這裡，外框、黑帶、中心鈕都共用。
 *
 * 色塊是量出來的，不是憑印象畫的——把官方球的圖（與主人手改的定稿）逐像素取樣，
 * 算出每塊色的實際色碼、外框、重心與二階矩，再換算回這個 64 單位的座標系。
 * 憑印象會畫成「超級球一條紅橫帶、高級球一條黃橫帶」，兩個都錯。
 * 要再加一顆球就照同一套流程量，別用看的。
 */
const TOP: Record<Ball, ReactNode> = {
  poke: <rect width="64" height={EQ} fill="#d1281b" />,
  great: (
    <>
      <rect width="64" height={EQ} fill="#2f6cc9" />
      {/* 兩個斜方塊，10.6 × 5，轉 18.5 度 */}
      <rect x="12.5" y="13.4" width="10.6" height="5" fill="#d1281b" transform="rotate(-18.5 17.8 15.9)" />
      <rect x="40.9" y="13.4" width="10.6" height="5" fill="#d1281b" transform="rotate(18.5 46.2 15.9)" />
    </>
  ),
  ultra: (
    <>
      <rect width="64" height={EQ} fill={INK} />
      {/* 黃色的 H：球是立體的，正面只看得到三個邊。
          外框是同一條盾路徑縮 0.828 倍，中間再挖一個黑方塊，H 的形狀就出來了 */}
      <path d={SHIELD} transform="translate(32 18.13) scale(.828) translate(-32 -18.13)" fill="#f2b705" />
      <rect x="20" y="15.8" width="24" height="16" fill={INK} />
    </>
  ),
  master: (
    <>
      <rect width="64" height={EQ} fill="#6b35c9" />
      {/* 桃紅是球面上的圓，正面只看得到半個，所以壓在肩線上讓盾把外側切掉 */}
      <ellipse cx="16.9" cy="15.85" rx="5.5" ry="3.6" fill="#e8578f" transform="rotate(-24 16.9 15.85)" />
      <ellipse cx="47.1" cy="15.85" rx="5.5" ry="3.6" fill="#e8578f" transform="rotate(24 47.1 15.85)" />
      <path
        d="M28.2 20.4 29 14.2 32 17.6 35 14.2 35.8 20.4"
        fill="none"
        stroke={PAPER}
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </>
  ),
};

/**
 * 聯盟對應的球。名字本來就是一組的：超級聯盟配超級球、高級配高級、大師配大師。
 * 精靈球留給不分聯盟的地方（頁尾署名、頁籤圖示），它是站本身的標記。
 *
 * @param cp 聯盟 CP 上限
 */
export function ballForCp(cp: number): Ball {
  if (cp <= 1500) return 'great';
  if (cp <= 2500) return 'ultra';
  return 'master';
}

/**
 * 站徽：精靈球配色的盾牌。
 *
 * 上半邊是球的花色、下半白、中間一條黑帶，帶上壓一顆中心鈕（黑圓、白圓、細黑圈三層）。
 * 外框刻意粗、黑帶刻意細：白色那半邊沒有框會糊進米白卡片，黑帶一粗就把中心鈕吃掉。
 *
 * @param size 邊長 px（背景浮水印另外用 CSS 覆蓋）
 * @param ball 球種，不給就是精靈球
 * @param title 給輔助技術讀的名稱，不給就當純裝飾
 */
export default function Logo({ size = 32, ball = 'poke', title }: {
  size?: number;
  ball?: Ball;
  title?: string;
}) {
  // 同一頁會出現好幾次（頁首、頁尾、浮水印），clipPath 的 id 不能撞
  const id = useId();
  return (
    <svg
      className="logo"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={id}>
          <path d={SHIELD} />
        </clipPath>
        {/* 上半邊再裁一次：高級球的黃色是整個盾縮小的，不裁會蓋到下半邊的白 */}
        <clipPath id={`${id}t`}>
          <rect width="64" height={EQ} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect y={EQ} width="64" height={64 - EQ} fill={PAPER} />
        <g clipPath={`url(#${id}t)`}>{TOP[ball]}</g>
        <rect y={EQ - 2.1} width="64" height="4.2" fill={INK} />
      </g>
      {/* 外框畫在填色之上，蓋掉裁切邊緣的鋸齒 */}
      <path d={SHIELD} fill="none" stroke={INK} strokeWidth="3.2" strokeLinejoin="round" />
      <circle cx="32" cy={EQ} r="10.8" fill={INK} />
      <circle cx="32" cy={EQ} r="8.8" fill={PAPER} />
      <circle cx="32" cy={EQ} r="6.2" fill="none" stroke={INK} strokeWidth="0.95" />
    </svg>
  );
}
