/**
 * 在 .verify/ 放一個 {"type":"commonjs"}。
 *
 * 專案根目錄的 package.json 是 "type": "module"，所以 Node 會把 .verify/ 底下
 * tsc 產出的 .js 當成 ES module，一跑就是 `exports is not defined in ES module scope`。
 * 那份輸出是 commonjs（tsconfig.verify.json 指定的，因為驗證腳本要直接 import JSON），
 * 所以要在輸出目錄標記回去。
 *
 * .verify/ 是建置產物、有進 .gitignore，這個檔案不能用手建——
 * 本機建過就一直在，乾淨 checkout 卻沒有，CI 才會紅而本機看不出來（2026-11-08 踩過）。
 *
 * 用 node 而不是 cp，是為了 Windows 上也跑得動。
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '.verify');
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'package.json'), JSON.stringify({ type: 'commonjs' }) + '\n');
