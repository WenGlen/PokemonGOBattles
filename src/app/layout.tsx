import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pokémon GO 對戰表',
  description: '算清楚誰克誰、什麼時候出招。照 2026-06-23 新版對戰系統做的逐回合模擬器與屬性克制表。',
  applicationName: 'Pokémon GO 對戰表',
  authors: [{ name: 'Glen Wen' }],
};

/** 瀏覽器工具列跟著站上的米白底走，手機上開起來不會上面一條白、下面一塊米白 */
export const viewport: Viewport = {
  themeColor: '#efe9db',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
