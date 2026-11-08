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
