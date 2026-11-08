/**
 * 中文名對照與資料正規化。
 * 抓今天的資料和回填歷史走的是同一條路，才能保證日誌裡的「變動」真的是資料變了，
 * 而不是兩支腳本各自算出不一樣的格式。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES, fetchText, parseGoTexts, parseCsv, normName, hasCjk } from './sources.mjs';

/**
 * 抓中文名來源並建好對照表。
 * @param {string} dataDir data/ 的絕對路徑
 * @returns {Promise<ReturnType<typeof buildZh>>}
 */
export async function fetchZhNames(dataDir) {
  const Z = SOURCES.zhNames;
  const [goEnRaw, goZhRaw, apiSpeciesRaw, apiMovesRaw] = await Promise.all([
    fetchText(Z.goEnglish),
    fetchText(Z.goChinese),
    fetchText(Z.apiSpecies),
    fetchText(Z.apiMoves),
  ]);
  return buildZh({ goEnRaw, goZhRaw, apiSpeciesRaw, apiMovesRaw, dataDir });
}

/**
 * 把四份原始文字組成「英文 → 中文」的查表函式。
 * @param {{goEnRaw: string, goZhRaw: string, apiSpeciesRaw: string, apiMovesRaw: string, dataDir: string}} input
 */
export function buildZh({ goEnRaw, goZhRaw, apiSpeciesRaw, apiMovesRaw, dataDir }) {
  const Z = SOURCES.zhNames;
  const goEn = parseGoTexts(goEnRaw);
  const goZh = parseGoTexts(goZhRaw);

  /** 圖鑑編號 → 中文基本名。GO 文字檔優先，PokeAPI 補缺。 */
  const dexZh = new Map();
  for (const [key, value] of goZh) {
    const m = /^pokemon_name_(\d+)$/.exec(key);
    if (m && hasCjk(value)) dexZh.set(Number(m[1]), value);
  }
  let dexFromApi = 0;
  for (const row of parseCsv(apiSpeciesRaw)) {
    if (row[1] !== Z.apiLang) continue;
    const dex = Number(row[0]);
    if (!dexZh.has(dex) && row[2]) { dexZh.set(dex, row[2]); dexFromApi++; }
  }

  /** 正規化英文招式名 → 中文。同樣 GO 優先、PokeAPI 補缺。 */
  const moveZh = new Map();
  for (const [key, english] of goEn) {
    if (!/^move_name_\d+$/.test(key)) continue;
    const zhText = goZh.get(key);
    if (zhText && hasCjk(zhText)) moveZh.set(normName(english), zhText);
  }
  const apiMoveEn = new Map();
  const apiMoveZh = new Map();
  for (const row of parseCsv(apiMovesRaw)) {
    if (row[1] === Z.apiLangEn) apiMoveEn.set(row[0], row[2]);
    else if (row[1] === Z.apiLang) apiMoveZh.set(row[0], row[2]);
  }
  let moveFromApi = 0;
  for (const [id, english] of apiMoveEn) {
    const zhText = apiMoveZh.get(id);
    const key = normName(english);
    if (zhText && !moveZh.has(key)) { moveZh.set(key, zhText); moveFromApi++; }
  }

  const zhTable = JSON.parse(readFileSync(join(dataDir, 'zh-forms.json'), 'utf8'));
  const formZh = zhTable['後綴'];
  const moveOverrideZh = zhTable['招式特例'];
  const moveDisambigZh = zhTable['招式同名區分'];
  const typeZh = JSON.parse(readFileSync(join(dataDir, 'type-zh.json'), 'utf8'));

  /** 名字裡所有括號內容，例如 Rattata (Alolan) (Shadow) → ['Alolan', 'Shadow'] */
  const parens = (name) => [...name.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]);

  /**
   * 寶可夢中文名：基本名查圖鑑編號，型態查 zh-forms.json。
   * @returns {string | null} 查不到就回 null，交給硬檢查處理
   */
  function zhPokemon(p) {
    const base = dexZh.get(p.dex);
    if (!base) return null;
    const forms = parens(p.speciesName);
    if (forms.some((f) => formZh[f] === undefined)) return null;
    const parts = forms.map((f) => formZh[f]).filter(Boolean);
    return parts.length ? `${base}（${parts.join('・')}）` : base;
  }

  /**
   * 招式中文名。「Weather Ball (Fire)」這類同名不同屬性的變體，
   * 基本名查表、括號直接用這一招自己的屬性中文，不另外維護對照。
   * @returns {string | null}
   */
  function zhMove(m) {
    if (moveOverrideZh[m.name]) return moveOverrideZh[m.name];
    const variant = /^(.+?)\s*\(([^()]+)\)$/.exec(m.name);
    const base = moveZh.get(normName(variant ? variant[1] : m.name));
    if (!base) return null;
    return variant ? `${base}（${typeZh[m.type] ?? variant[2]}）` : base;
  }

  return {
    zhPokemon, zhMove, parens, formZh, typeZh, moveDisambigZh,
    stats: { dexZh: dexZh.size, dexFromApi, moveZh: moveZh.size, moveFromApi, goTexts: goZh.size },
  };
}

/**
 * 招式中文名，含解撞名。
 *
 * 幾組招式在中文裡會撞在一起，但對戰數值差很多，不能混在一起顯示：
 *   · 超級專用招：Brave Bird 130 威力 vs Brave Bird+ 70 威力，都叫勇鳥猛攻
 *   · 同招不同屬性：莫魯貝可的氣場輪有惡與電兩種
 *   · 堅盾劍怪盾牌形態的快招：0 威力、只累積能量，名字跟一般招一樣
 * 依序套三條規則，最後還撞名的由硬檢查擋下來。
 *
 * @param {object[]} rawMoves pvpoke gamemaster 的 moves
 * @param {ReturnType<typeof buildZh>} zh
 * @returns {Map<string, string | null>} moveId → 中文名（null 代表查不到）
 */
export function zhMoveNames(rawMoves, zh) {
  const base = new Map(rawMoves.map((m) => [m.moveId, zh.zhMove(m)]));
  const byId = new Map(rawMoves.map((m) => [m.moveId, m]));

  /** 目前哪些中文名被幾個招式共用 */
  const groups = () => {
    const g = new Map();
    for (const [id, name] of base) {
      if (!name) continue;
      if (!g.has(name)) g.set(name, []);
      g.get(name).push(id);
    }
    return [...g.values()].filter((ids) => ids.length > 1);
  };

  // 規則 1：超級專用招，遊戲裡本來就叫 Brave Bird+，中文補一個全形＋
  for (const ids of groups()) {
    for (const id of ids) {
      if (byId.get(id).name.trim().endsWith('+')) base.set(id, `${base.get(id)}＋`);
    }
  }
  // 規則 2：同名但屬性不同，用屬性區分
  for (const ids of groups()) {
    const types = new Set(ids.map((id) => byId.get(id).type));
    if (types.size !== ids.length) continue;
    for (const id of ids) base.set(id, `${base.get(id)}（${zh.typeZh[byId.get(id).type] ?? byId.get(id).type}）`);
  }
  // 規則 3：還撞名的查手工表
  for (const ids of groups()) {
    for (const id of ids) {
      const tag = zh.moveDisambigZh[id];
      if (tag) base.set(id, `${base.get(id)}（${tag}）`);
    }
  }
  return base;
}

/** 只留已上線的寶可夢 */
export const released = (gm) => (gm.pokemon ?? []).filter((p) => p.released);

/**
 * 把 pvpoke 的 gamemaster 瘦身成前端要的格式，順便掛上中文名。
 * @param {object} gm pvpoke gamemaster.min.json
 * @param {ReturnType<typeof buildZh>} zh
 * @returns {{timestamp: string, pokemon: object[], moves: object[]}}
 */
export function normalizeBundle(gm, zh) {
  const moveById = new Map((gm.moves ?? []).map((m) => [m.moveId, m]));
  const moveNames = zhMoveNames(gm.moves ?? [], zh);
  const mons = released(gm);
  const shadowSet = new Set(gm.shadowPokemon ?? []);
  const usedMoves = new Set();

  const pokemon = mons.map((p) => {
    (p.fastMoves ?? []).forEach((m) => usedMoves.add(m));
    (p.chargedMoves ?? []).forEach((m) => usedMoves.add(m));
    return {
      id: p.speciesId,
      dex: p.dex,
      name: p.speciesName,
      zh: zh.zhPokemon(p),
      types: p.types.filter((t) => t !== 'none'),
      stats: [p.baseStats.atk, p.baseStats.def, p.baseStats.hp],
      fast: p.fastMoves,
      charged: p.chargedMoves,
      iv: p.defaultIVs,
      /** 這一筆本身就是暗影型態（攻擊 ×1.2、防禦 ×0.8333），不是「可以暗影化」 */
      shadow: p.tags?.includes('shadow') || undefined,
      /** 可以暗影化，但這一筆是普通型態 */
      shadowEligible: shadowSet.has(p.speciesId) || undefined,
      tags: p.tags?.length ? p.tags : undefined,
    };
  });

  // 全部招式都帶著走，不只「有寶可夢學得會」的那些：
  // pvpoke 常在寶可夢上線前就先把新招式加進來，那正是最值得提早知道的變動。
  // 多出來的 30 幾個招式只占約 4 KB。
  const moves = [...moveById.values()]
    .map((m) => ({
      id: m.moveId,
      name: m.name,
      zh: moveNames.get(m.moveId),
      type: m.type,
      power: m.power,
      energy: m.energy,
      energyGain: m.energyGain,
      turns: m.turns ?? 1,
      buffs: m.buffs,
      buffTarget: m.buffTarget,
      buffChance: m.buffApplyChance ? Number(m.buffApplyChance) : undefined,
      /** 目前沒有已上線的寶可夢學得會——通常代表它的寶可夢還沒上線 */
      unused: usedMoves.has(m.moveId) ? undefined : true,
    }));

  return { timestamp: gm.timestamp, pokemon, moves };
}

/**
 * 排名只留前 300 名與精簡欄位。
 * @param {Record<string, object[]>} rankings 以 cp 為鍵
 */
export function normalizeRankings(rankings) {
  const out = {};
  for (const lg of SOURCES.rankings.leagues) {
    out[lg.cp] = (rankings[lg.cp] ?? []).slice(0, 300).map((r) => ({
      id: r.speciesId,
      score: r.score,
      moveset: r.moveset,
    }));
  }
  return out;
}
