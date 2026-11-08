/**
 * 抓取並驗證 Pokémon GO 對戰資料，並記錄這一次跟上一次比有什麼變。
 *
 * 來源選擇的理由見 README「資料從哪裡來」：
 *   PokeMiners/game_masters 已停更（最近 2026-08-29），改以 pvpoke/pvpoke 為主源（MIT，每 2–3 天更新）。
 *
 * 流程：抓取 → 驗證（硬檢查）→ 正規化瘦身 → 跟上一版 diff → 寫出 data/*.json
 * 任一硬檢查失敗就 exit 1，不會產出半套資料，也不會寫日誌。
 *
 * 名稱一律中文：基本名與招式名查 PokeMiners 的 GO 繁中文字檔，查不到的用 PokeAPI 官方譯名補，
 * 型態後綴查 data/zh-forms.json。三者都有硬檢查，查不到就中止。
 *
 * 變動日誌：上一版就是 data/gamemaster.json 自己，所以不必另外存快照。
 * 每次比對出來的變動會往 data/changelog.json 前面插一筆。
 *
 * 用法：npm run data
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, TYPES, fetchJson, calcCP } from './lib/sources.mjs';
import { fetchZhNames, zhMoveNames, normalizeBundle, normalizeRankings } from './lib/normalize.mjs';
import { diffBundles, diffRankings, isNotable, describe } from './lib/diff.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const PUBLIC_DIR = join(ROOT, 'public', 'data');

/** @type {{name: string, ok: boolean, detail: string, hard: boolean}[]} */
const checks = [];

/**
 * 登記一項驗證結果。
 * @param {string} name 檢查名稱
 * @param {boolean} ok 是否通過
 * @param {string} detail 人看得懂的說明
 * @param {boolean} [hard=true] 硬檢查失敗會中止流程
 */
function check(name, ok, detail, hard = true) {
  checks.push({ name, ok, detail, hard });
}

/** 讀一份既有的輸出當作「上一版」，沒有就回 null */
function readPrev(file) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  console.log('\n═══ Pokémon GO 對戰資料抓取 ═══\n');

  // ── 1. 抓取 ────────────────────────────────────────────────
  console.log('抓取中…');
  const { data: gm, bytes: gmBytes } = await fetchJson(SOURCES.gamemaster.url);
  console.log(`  gamemaster.min.json  ${(gmBytes / 1024).toFixed(0)} KB`);

  const rankings = {};
  for (const lg of SOURCES.rankings.leagues) {
    const { data, bytes } = await fetchJson(`${SOURCES.rankings.base}/rankings-${lg.cp}.json`);
    rankings[lg.cp] = data;
    console.log(`  rankings-${lg.cp}.json${' '.repeat(Math.max(0, 11 - String(lg.cp).length))}${(bytes / 1024).toFixed(0)} KB  (${data.length} 筆)`);
  }

  let lastCommit = null;
  try {
    const { data } = await fetchJson(SOURCES.commitsApi, 1);
    lastCommit = { date: data[0].commit.author.date, message: data[0].commit.message.split('\n')[0] };
  } catch {
    /* 非必要，失敗不影響 */
  }

  const zh = await fetchZhNames(DATA_DIR);
  const { zhPokemon, zhMove, parens, formZh } = zh;
  console.log(`  GO 文字檔            ${zh.stats.goTexts} 條（繁中）`);
  console.log(`  中文名對照表          寶可夢 ${zh.stats.dexZh} 筆（PokeAPI 補 ${zh.stats.dexFromApi}）、招式 ${zh.stats.moveZh} 筆（PokeAPI 補 ${zh.stats.moveFromApi}）`);

  // ── 2. 驗證 ────────────────────────────────────────────────
  const moveById = new Map((gm.moves ?? []).map((m) => [m.moveId, m]));
  const mons = (gm.pokemon ?? []).filter((p) => p.released);

  check('資料源可達', true, `${SOURCES.gamemaster.repo} (${SOURCES.gamemaster.license})`);

  check('有 timestamp', Boolean(gm.timestamp), gm.timestamp ? `${gm.timestamp}` : '缺少 timestamp 欄位');

  const ageDays = gm.timestamp ? (Date.now() - new Date(gm.timestamp.replace(' ', 'T') + 'Z').getTime()) / 86400000 : 999;
  check('資料夠新（≤14 天）', ageDays <= 14, `距今 ${ageDays.toFixed(1)} 天`, false);

  check('寶可夢數量合理', mons.length > 800, `已上線 ${mons.length} 隻（全部 ${gm.pokemon?.length ?? 0}）`);
  check('招式數量合理', moveById.size > 300, `${moveById.size} 個招式`);

  const badStats = mons.filter((p) => !p.baseStats || !(p.baseStats.atk > 0 && p.baseStats.def > 0 && p.baseStats.hp > 0));
  check('每隻都有三圍', badStats.length === 0, badStats.length ? `${badStats.length} 隻缺三圍：${badStats.slice(0, 3).map((p) => p.speciesId)}` : '全部通過');

  const badTypes = mons.filter((p) => !p.types?.length || p.types.some((t) => t !== 'none' && !TYPES.includes(t)));
  check('屬性都在 18 種內', badTypes.length === 0, badTypes.length ? `${badTypes.length} 隻異常：${badTypes.slice(0, 3).map((p) => p.speciesId)}` : '全部通過');

  const missingRefs = [];
  for (const p of mons) {
    for (const id of [...(p.fastMoves ?? []), ...(p.chargedMoves ?? [])]) {
      if (!moveById.has(id)) missingRefs.push(`${p.speciesId}:${id}`);
    }
  }
  check('招式池參照完整', missingRefs.length === 0, missingRefs.length ? `${missingRefs.length} 個斷鏈：${missingRefs.slice(0, 3)}` : '無斷鏈招式');

  const fast = [...moveById.values()].filter((m) => m.energyGain > 0);
  const badFast = fast.filter((m) => !(m.turns >= 1) || !(m.energyGain > 0) || typeof m.power !== 'number');
  check('快招有 turns/能量', badFast.length === 0, badFast.length ? `${badFast.length} 個異常：${badFast.slice(0, 3).map((m) => m.moveId)}` : `${fast.length} 個快招全部通過`);

  const charged = [...moveById.values()].filter((m) => m.energy > 0);
  const badCharged = charged.filter((m) => !(m.energy > 0) || typeof m.power !== 'number');
  check('大招有能量需求', badCharged.length === 0, badCharged.length ? `${badCharged.length} 個異常` : `${charged.length} 個大招全部通過`);

  // 關鍵驗證：用 pvpoke 自己的 defaultIVs 回推 CP，驗證我們的數值引擎與等級索引推論
  const cpmTable = JSON.parse(readFileSync(join(DATA_DIR, 'cpm.json'), 'utf8')).values;
  let cpTested = 0;
  const cpFails = [];
  for (const p of mons) {
    const d = p.defaultIVs?.cp1500;
    if (!d) continue;
    const [level, ...ivs] = d;
    const cpm = cpmTable[Math.round((level - 1) * 2)];
    if (cpm === undefined) continue;
    cpTested++;
    const cp = calcCP(p.baseStats, ivs, cpm);
    if (cp > 1500) cpFails.push(`${p.speciesId}=${cp}`);
  }
  check(
    'CP 引擎對帳（超級聯盟）',
    cpFails.length === 0,
    cpFails.length ? `${cpFails.length}/${cpTested} 超標：${cpFails.slice(0, 3)}` : `${cpTested} 隻以 pvpoke 建議 IV 算出的 CP 全部 ≤1500`
  );

  for (const lg of SOURCES.rankings.leagues) {
    const r = rankings[lg.cp];
    const ok = Array.isArray(r) && r.length > 100 && r[0].speciesId && Array.isArray(r[0].matchups);
    check(`排名資料：${lg.name}`, ok, ok ? `${r.length} 筆，第一名 ${r[0].speciesName}（score ${r[0].score}）` : '結構不符預期');
  }

  // 中文化：三件事都要能查到，缺一個就中止，免得畫面上混著英文
  const knownForms = new Set(Object.keys(formZh));
  const unknownForms = new Set();
  for (const p of mons) for (const f of parens(p.speciesName)) if (!knownForms.has(f)) unknownForms.add(f);
  check(
    '型態後綴都有中文',
    unknownForms.size === 0,
    unknownForms.size ? `${unknownForms.size} 個沒收錄，請補進 data/zh-forms.json：${[...unknownForms].slice(0, 5)}` : `${knownForms.size} 種後綴全部有對照`
  );

  const noZhMon = mons.filter((p) => !zhPokemon(p));
  check(
    '寶可夢都有中文名',
    noZhMon.length === 0,
    noZhMon.length ? `${noZhMon.length} 隻查不到：${noZhMon.slice(0, 5).map((p) => p.speciesName)}` : `${mons.length} 隻全部有中文名`
  );

  // 招式全部出貨（含還沒有寶可夢學得會的新招），所以中文名也全部都要有
  const allMoves = [...moveById.values()];
  const moveNames = zhMoveNames(allMoves, zh);
  const noZhMove = allMoves.filter((m) => !moveNames.get(m.moveId));
  check(
    '招式都有中文名',
    noZhMove.length === 0,
    noZhMove.length ? `${noZhMove.length} 個查不到：${noZhMove.slice(0, 5).map((m) => m.name)}` : `${allMoves.length} 個全部有中文名`
  );

  // 招式撞名比寶可夢撞名更危險：超級專用招的數值跟原招差很多，選錯就算錯
  const moveSeen = new Map();
  const moveDupes = [];
  for (const m of allMoves) {
    const zhText = moveNames.get(m.moveId);
    if (!zhText) continue;
    if (moveSeen.has(zhText)) moveDupes.push(`${zhText}＝${moveSeen.get(zhText)}／${m.moveId}`);
    else moveSeen.set(zhText, m.moveId);
  }
  check(
    '招式中文名沒有撞名',
    moveDupes.length === 0,
    moveDupes.length ? `${moveDupes.length} 組重複，請補 data/zh-forms.json 的「招式同名區分」：${moveDupes.slice(0, 3)}` : `${moveSeen.size} 個名字各自唯一`
  );

  // 中文名撞名代表對照表接錯了（例如基本名查到同一隻、型態卻沒分出來）
  const seen = new Map();
  const dupes = [];
  for (const p of mons) {
    const zhText = zhPokemon(p);
    if (!zhText) continue;
    if (seen.has(zhText)) dupes.push(`${zhText}＝${seen.get(zhText)}／${p.speciesId}`);
    else seen.set(zhText, p.speciesId);
  }
  check(
    '寶可夢中文名沒有撞名',
    dupes.length === 0,
    dupes.length ? `${dupes.length} 組重複：${dupes.slice(0, 3)}` : `${seen.size} 個名字各自唯一`
  );

  // ── 3. 報告 ────────────────────────────────────────────────
  console.log('\n─── 驗證結果 ───');
  const pad = Math.max(...checks.map((c) => [...c.name].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0)));
  for (const c of checks) {
    const w = [...c.name].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
    console.log(`  ${c.ok ? '✅' : c.hard ? '❌' : '⚠️ '} ${c.name}${' '.repeat(pad - w)}  ${c.detail}`);
  }

  const hardFails = checks.filter((c) => !c.ok && c.hard);
  if (hardFails.length) {
    console.error(`\n❌ ${hardFails.length} 項硬檢查失敗，不產出資料。\n`);
    process.exit(1);
  }

  // ── 4. 正規化瘦身 ──────────────────────────────────────────
  const bundle = normalizeBundle(gm, zh);
  const outRankings = normalizeRankings(rankings);

  // ── 5. 跟上一版比對 ────────────────────────────────────────
  // 上一版就是上一次寫出去的 data/gamemaster.json，不必另外存快照。
  const prevBundle = readPrev('gamemaster.json');
  const prevRankings = readPrev('rankings.json');
  const changelog = readPrev('changelog.json') ?? { entries: [] };

  let entry = null;
  if (!prevBundle) {
    console.log('\n─── 變動日誌 ───');
    console.log('  這是第一次產出，沒有可以比對的上一版，先建立基準。');
    console.log('  想要一開始就有歷史紀錄的話跑：npm run changelog:backfill');
  } else if (prevBundle.timestamp === bundle.timestamp) {
    console.log('\n─── 變動日誌 ───');
    console.log(`  資料 timestamp 沒變（${bundle.timestamp}），不記錄。`);
  } else {
    const data = diffBundles(prevBundle, bundle, outRankings);
    const rank = diffRankings(prevRankings, outRankings, bundle);
    entry = {
      date: new Date().toISOString().slice(0, 10),
      from: prevBundle.timestamp,
      to: bundle.timestamp,
      notable: isNotable(data),
      ...data,
      rankings: rank,
    };
    console.log('\n─── 變動日誌 ───');
    const lines = describe(entry);
    for (const line of lines) console.log(`  ${line}`);
    // 在 GitHub Actions 上順手把同一份內容寫進 job summary，不必點進 log 看
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 資料變動\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
    }
    // 同一組 timestamp 只留一筆，重跑不會長出重複紀錄
    changelog.entries = [entry, ...changelog.entries.filter((e) => !(e.from === entry.from && e.to === entry.to))];
  }

  // ── 6. 寫出 ────────────────────────────────────────────────
  const bundleJson = JSON.stringify(bundle);
  const rankingsJson = JSON.stringify(outRankings);
  changelog.entries = changelog.entries.slice(0, 200);
  changelog.updatedAt = new Date().toISOString();
  const changelogJson = JSON.stringify(changelog);

  const meta = {
    fetchedAt: new Date().toISOString(),
    gamemasterTimestamp: gm.timestamp,
    source: SOURCES.gamemaster,
    zhNameSources: SOURCES.zhNames,
    lastSourceCommit: lastCommit,
    counts: { pokemon: bundle.pokemon.length, moves: bundle.moves.length },
    changelogEntries: changelog.entries.length,
    checks: checks.map(({ name, ok, detail }) => ({ name, ok, detail })),
  };
  const metaJson = JSON.stringify(meta, null, 2);

  mkdirSync(PUBLIC_DIR, { recursive: true });
  for (const dir of [DATA_DIR, PUBLIC_DIR]) {
    writeFileSync(join(dir, 'gamemaster.json'), bundleJson);
    writeFileSync(join(dir, 'rankings.json'), rankingsJson);
    writeFileSync(join(dir, 'changelog.json'), changelogJson);
    writeFileSync(join(dir, 'meta.json'), metaJson);
  }

  console.log('\n─── 產出 ───');
  console.log(`  data/gamemaster.json  ${(Buffer.byteLength(bundleJson) / 1024).toFixed(0)} KB  （原始 ${(gmBytes / 1024).toFixed(0)} KB）`);
  console.log(`  data/rankings.json    ${(Buffer.byteLength(rankingsJson) / 1024).toFixed(0)} KB`);
  console.log(`  data/changelog.json   ${(Buffer.byteLength(changelogJson) / 1024).toFixed(0)} KB  （${changelog.entries.length} 筆變動）`);
  console.log(`  data/meta.json        來源與驗證紀錄`);
  if (lastCommit) console.log(`\n  主源最後更新：${lastCommit.date.slice(0, 10)}  「${lastCommit.message}」`);
  console.log('\n✅ 完成\n');
}

main().catch((err) => {
  console.error('\n❌', err.message, '\n');
  process.exit(1);
});
