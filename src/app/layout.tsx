import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '寶可夢 GO 對戰模擬器',
  description: '照 2026-06-23 新版對戰系統計算出招時機的逐回合模擬器',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
