import type { NextConfig } from 'next';

/** @type {NextConfig} 全靜態輸出，可直接丟 Cloudflare Pages／任何靜態主機 */
const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
