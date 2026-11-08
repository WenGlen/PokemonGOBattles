/**
 * 回填變動日誌。
 *
 * 每日 pipeline 只知道「今天跟昨天的差別」，所以第一次跑的時候日誌是空的。
 * 這支把 pvpoke 歷史上每一版 gamemaster.min.json 抓下來，逐版比對，
 * 一次補出真實的歷史紀錄——不是假資料，是 pvpoke 當時真的改了什麼。
 *
 * 用法：
 *   npm run changelog:backfill              # 預設回填 250 天、最多 40 版（約 38 MB，跑幾分鐘）
 *   npm run changelog:backfill -- --days 60 --max 12
 *   npm run changelog:backfill -- --fresh   # 不合併既有日誌，整個重建
 *
 * 排名沒有一起回填：每一版要多抓三份共 ~2.4 MB，代價太高，
 * 而排名本來就是次要訊號。歷史條目因此沒有 rankings 區塊。
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, fetchJson } from './lib/sources.mjs';
import { fetchZhNames, normalizeBundle } from './lib/normalize.mjs';
import { diffBundles, isNotable, describe } from './lib/diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const PUBLIC_DIR = join(ROOT, 'public', 'data');

/** 讀命令列參數，例如 --days 60 */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
}
const DAYS = arg('days', 250);
const MAX = arg('max', 40);
const FRESH = process.argv.includes('--fresh');

/** 舊版本可能有現在查不到中文名的東西，退回英文名，不要讓日誌出現 null */
function fillNames(bundle) {
  let fallback = 0;
  for (const p of bundle.pokemon) if (!p.zh) { p.zh = p.name; fallback++; }
  for (const m of bundle.moves) if (!m.zh) { m.zh = m.name; fallback++; }
  return fallback;
}

async function main() {
  console.log('\n═══ 回填變動日誌 ═══\n');

  const { data: commits } = await fetchJson(SOURCES.fileCommitsApi(SOURCES.gamemaster.path, 100));
  const cutoff = Date.now() - DAYS * 86400000;
  // API 回的是新到舊，回填要由舊往新走
  const picked = commits
    .map((c) => ({ sha: c.sha, date: c.commit.committer.date, message: c.commit.message.split('\n')[0] }))
    .filter((c) => new Date(c.date).getTime() >= cutoff)
    .slice(0, MAX + 1)
    .reverse();

  if (picked.length < 2) {
    console.error(`❌ ${DAYS} 天內只有 ${picked.length} 版，至少要兩版才比得出變動。把 --days 調大一點。\n`);
    process.exit(1);
  }
  console.log(`${DAYS} 天內有 ${picked.length} 版可比對（${picked[0].date.slice(0, 10)} → ${picked.at(-1).date.slice(0, 10)}）`);

  const zh = await fetchZhNames(DATA_DIR);
  console.log(`中文名對照表就緒（寶可夢 ${zh.stats.dexZh} 筆、招式 ${zh.stats.moveZh} 筆）\n`);

  // 影響分析用現在的排名：問的是「現在的主流裡誰會這招」
  const rankingsNow = existsSync(join(DATA_DIR, 'rankings.json'))
    ? JSON.parse(readFileSync(join(DATA_DIR, 'rankings.json'), 'utf8'))
    : {};

  const entries = [];
  let prev = null;
  let prevMeta = null;
  let fetched = 0;
  let skippedSameTs = 0;

  for (const c of picked) {
    const { data: gm, bytes } = await fetchJson(SOURCES.rawAt(c.sha, SOURCES.gamemaster.path));
    fetched += bytes;
    const bundle = normalizeBundle(gm, zh);
    fillNames(bundle);

    if (!prev) {
      console.log(`基準 ${c.date.slice(0, 10)}  ${c.sha.slice(0, 8)}  ${bundle.timestamp}`);
      prev = bundle; prevMeta = c;
      continue;
    }
    if (prev.timestamp === bundle.timestamp) {
      skippedSameTs++;
      prev = bundle; prevMeta = c;
      continue;
    }

    const data = diffBundles(prev, bundle, rankingsNow);
    const entry = {
      date: c.date.slice(0, 10),
      from: prev.timestamp,
      to: bundle.timestamp,
      sha: c.sha.slice(0, 8),
      message: c.message,
      notable: isNotable(data),
      ...data,
    };
    entries.push(entry);
    for (const line of describe(entry)) console.log(line);
    console.log('');

    prev = bundle; prevMeta = c;
  }

  // 新到舊
  entries.sort((a, b) => (a.to < b.to ? 1 : -1));

  const existingPath = join(DATA_DIR, 'changelog.json');
  const existing = !FRESH && existsSync(existingPath)
    ? JSON.parse(readFileSync(existingPath, 'utf8'))
    : { entries: [] };
  const seen = new Set(entries.map((e) => `${e.from}→${e.to}`));
  const merged = [...entries, ...(existing.entries ?? []).filter((e) => !seen.has(`${e.from}→${e.to}`))]
    .sort((a, b) => (a.to < b.to ? 1 : -1))
    .slice(0, 200);

  const out = JSON.stringify({ entries: merged, updatedAt: new Date().toISOString() });
  mkdirSync(PUBLIC_DIR, { recursive: true });
  writeFileSync(existingPath, out);
  writeFileSync(join(PUBLIC_DIR, 'changelog.json'), out);

  const notable = merged.filter((e) => e.notable).length;
  console.log('─── 結果 ───');
  console.log(`  下載 ${(fetched / 1024 / 1024).toFixed(1)} MB、${picked.length} 版${skippedSameTs ? `（${skippedSameTs} 版 timestamp 沒變，略過）` : ''}`);
  console.log(`  data/changelog.json  ${(Buffer.byteLength(out) / 1024).toFixed(0)} KB  共 ${merged.length} 筆，其中 ${notable} 筆有影響對戰的變動`);
  console.log('\n✅ 完成\n');
}

main().catch((err) => {
  console.error('\n❌', err.message, '\n');
  process.exit(1);
});
