'use client';

import { useState } from 'react';
import { pokemonIconUrl, typeIconUrl, TYPE_COLOR } from '@/lib/icons';
import { TYPE_ZH } from '@/lib/typeChart';

/**
 * CDN 失敗時換成 raw.githubusercontent 再試一次，兩邊都掛才放棄。
 * @param primary CDN 網址
 * @param fallback 備援網址
 */
function useFallback(primary: string, fallback: string) {
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  // 換圖時要回到第一階段，所以用 key 讓 React 重建這個元件（見呼叫端）
  return {
    src: stage === 0 ? primary : fallback,
    hidden: stage === 2,
    onError: () => setStage((s) => (s === 0 ? 1 : 2)),
  };
}

/**
 * 寶可夢圖示。
 * @param icon 識別碼
 * @param alt 中文名
 * @param size 邊長 px
 * @param shadow 暗影型態：遊戲裡用的是本體的圖，這裡自己加一圈紫光區別
 */
export function PokemonIcon({ icon, alt, size = 28, shadow = false }: {
  icon: string;
  alt: string;
  size?: number;
  shadow?: boolean;
}) {
  const img = useFallback(pokemonIconUrl(icon), pokemonIconUrl(icon, true));
  return (
    <span className={`pic${shadow ? ' shadow' : ''}`} style={{ width: size, height: size }}>
      {!img.hidden && (
        <img src={img.src} alt={alt} width={size} height={size} loading="lazy" decoding="async" onError={img.onError} />
      )}
    </span>
  );
}

/**
 * 屬性圖示。招式沒有自己的美術，遊戲裡就是用屬性圖示表示，所以招式也用這個。
 * @param type 小寫屬性名
 * @param size 邊長 px
 * @param label true 時圖示後面接中文屬性名
 */
export function TypeIcon({ type, size = 16, label = false }: { type: string; size?: number; label?: boolean }) {
  const img = useFallback(typeIconUrl(type), typeIconUrl(type, true));
  const zh = TYPE_ZH[type] ?? type;
  return (
    <span className="tic" title={zh}>
      <span className="tic-dot" style={{ width: size, height: size, background: TYPE_COLOR[type] ?? 'var(--line)' }}>
        {!img.hidden && <img src={img.src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={img.onError} />}
      </span>
      {label && <span>{zh}</span>}
    </span>
  );
}

/**
 * 盾牌（抵抗）與爆炸（被剋）。
 *
 * 用 currentColor，所以顏色跟著格子的克制色走，不用每一段各畫一份。
 * 畫成 path 而不是抓外部圖檔：這是純靜態站，十八格一次要畫幾十個記號，
 * 多幾十個 request 不划算，而且外部圖檔沒辦法跟著 CSS 變數換色。
 *
 * @param size 邊長 px
 */
export function ShieldIcon({ size = 13 }: { size?: number }) {
  return (
    <svg className="mk" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2.2 20.2 5.4v6.1c0 4.9-3.4 8.9-8.2 10.3C7.2 20.4 3.8 16.4 3.8 11.5V5.4L12 2.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * 爆炸。
 * @param size 邊長 px
 */
export function BurstIcon({ size = 13 }: { size?: number }) {
  return (
    <svg className="mk" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 1.6 14.5 7 20 4.6 18.2 10.3 24 11.4 18.9 14.4 22.6 19 16.7 18.6 16.9 24.4 12.4 20.6 8.4 24.4 8 18.6 2.2 19 5.6 14.4 0.4 11.4 6.2 10.3 4.4 4.6 9.9 7 12 1.6Z"
        fill="currentColor"
      />
    </svg>
  );
}
