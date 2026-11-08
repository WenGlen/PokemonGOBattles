/**
 * 寶可夢圖示的檔名解析。
 *
 * 圖片不放進這個 repo：那些是 Niantic 的美術資產，PokeMiners 只是把它們從 APK 挖出來。
 * 我們只存「檔名」，執行時由 jsDelivr 的 CDN 去取，所以這個專案不重新散布任何美術檔。
 *
 * 檔名規則：pm{圖鑑編號}[.f{FORM}][.s].icon.png
 *   pm487.fORIGIN.icon.png   騎拉帝納（起源形態）
 *   pm6.fMEGA_Y.icon.png     噴火龍（超級 Y）
 *   pm1.icon.png             妙蛙種子
 * form 代碼是 Niantic 自己的英文列舉，大多數把 pvpoke 的後綴轉大寫就對得上，
 * 對不上的收在 data/icon-forms.json。
 */

import { fetchJson } from './sources.mjs';

const REPO = 'PokeMiners/pogo_assets';
const DIR = 'Images/Pokemon/Addressable Assets';

/** 後綴轉成 GO 的 form 代碼寫法：大寫、去掉標點、空白換底線 */
const code = (s) => s.toUpperCase().replace(/['’.]/g, '').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');

/**
 * 取得資產目錄裡所有檔名。
 * contents API 單頁上限會截斷，所以逐層走 git trees。
 * @returns {Promise<string[]>}
 */
export async function fetchIconFileList() {
  let sha = 'master';
  for (const part of DIR.split('/')) {
    const { data } = await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${sha}`);
    const node = data.tree.find((x) => x.path === part);
    if (!node) throw new Error(`資產目錄找不到 ${part}（${DIR}）`);
    sha = node.sha;
  }
  const { data } = await fetchJson(`https://api.github.com/repos/${REPO}/git/trees/${sha}`);
  if (data.truncated) throw new Error('資產檔案清單被 GitHub 截斷，解析會不完整');
  return data.tree.map((x) => x.path);
}

/**
 * 建一個「寶可夢 → 圖示檔名」的解析器。
 * @param {string[]} files 資產目錄的檔名清單
 * @param {{後綴: Record<string, string[]>, 預設型態: Record<string, string>}} table data/icon-forms.json
 */
export function buildIconResolver(files, table) {
  const alias = table['後綴'];
  const defaults = table['預設型態'];
  /** @type {Map<number, string[]>} 圖鑑編號 → 這隻所有非閃光的 icon 檔名（已排序，確保結果穩定） */
  const byDex = new Map();
  for (const f of files) {
    const m = /^pm(\d+)\.(.*\.)?icon\.png$/.exec(f);
    if (!m || f.includes('.s.icon.png')) continue;
    const dex = Number(m[1]);
    if (!byDex.has(dex)) byDex.set(dex, []);
    byDex.get(dex).push(f);
  }
  for (const list of byDex.values()) list.sort();

  /**
   * @param {{dex: number, name: string}} p pvpoke 的一筆寶可夢
   * @returns {{file: string, exact: boolean} | null}
   *   exact=false 代表是退回來的圖（例如 pvpoke 有這個超級型態、但遊戲裡還沒有美術）
   */
  return function resolve(p) {
    const have = byDex.get(p.dex);
    if (!have?.length) return null;
    const has = (f) => (have.includes(f) ? f : null);

    // 暗影在遊戲裡用的是本體的圖，只是多一圈紫火，所以不另外找
    const forms = [...p.name.matchAll(/\(([^()]+)\)/g)].map((m) => m[1]).filter((f) => f !== 'Shadow');
    const species = code(p.name.split('(')[0].trim());

    /** @type {string[]} 依序試的候選 */
    const tries = [];
    if (forms.length) {
      const codes = forms.flatMap((f) => (alias[f] ?? [code(f)]));
      tries.push(`pm${p.dex}.f${forms.map((f) => (alias[f]?.[0] ?? code(f))).join('_')}.icon.png`);
      for (const c of codes) tries.push(`pm${p.dex}.f${c}.icon.png`);
      // Burmy (Plant) 在資產裡是 fBURMY_PLANT，型態代碼前面再掛一次 species
      for (const c of codes) tries.push(`pm${p.dex}.f${species}_${c}.icon.png`);
    }
    for (const t of tries) {
      const f = has(t);
      if (f) return { file: f, exact: true };
    }

    // 退回：沒有型態、或這個型態遊戲裡還沒有圖
    const fallback =
      has(`pm${p.dex}.icon.png`) ??
      (defaults[String(p.dex)] ? has(`pm${p.dex}.f${defaults[String(p.dex)]}.icon.png`) : null) ??
      has(`pm${p.dex}.fNORMAL.icon.png`) ??
      have[0];
    return { file: fallback, exact: forms.length === 0 };
  };
}

/**
 * 解析成要存進 gamemaster.json 的字串。
 * 前綴決定前端去哪裡取圖（見 src/lib/icons.ts）：
 *   go:pm487.fORIGIN  → Pokémon GO 的美術資產
 *   home:778          → PokeAPI 的 Pokémon HOME 圖，補 GO 資產沒有的那些
 *
 * @param {(p: object) => {file: string, exact: boolean} | null} resolve buildIconResolver 的回傳
 * @param {{dex: number, name: string}} p
 * @returns {{icon: string, source: 'go' | 'home', exact: boolean}}
 */
export function iconFor(resolve, p) {
  const r = resolve(p);
  if (!r) return { icon: `home:${p.dex}`, source: 'home', exact: false };
  return { icon: `go:${r.file.replace(/\.icon\.png$/, '')}`, source: 'go', exact: r.exact };
}

/**
 * 圖示的兩個來源。前端有一份一樣的（src/lib/icons.ts），改了要兩邊一起改。
 *
 * 用 statically.io 而不是 jsDelivr：jsDelivr 對整個 repo 有 50 MB 上限，
 * pogo_assets 遠遠超過，實測會回 403「Package size exceeded」——而且是零星幾張，
 * 已經被快取的照樣 200，所以只抽驗幾張看不出來。statically 與 raw 都整包能取。
 */
export const ICON_BASE = {
  go: 'https://cdn.statically.io/gh/PokeMiners/pogo_assets/master/Images/Pokemon/Addressable Assets',
  home: 'https://cdn.statically.io/gh/PokeAPI/sprites/master/sprites/pokemon/other/home',
  type: 'https://cdn.statically.io/gh/PokeMiners/pogo_assets/master/Images/Types',
};

/**
 * 識別碼 → 完整網址。
 * @param {string} icon 例如 go:pm487.fORIGIN、home:778
 */
export function iconUrl(icon) {
  const [src, id] = icon.split(':');
  return src === 'home'
    ? `${ICON_BASE.home}/${id}.png`
    : `${ICON_BASE.go}/${encodeURIComponent(`${id}.icon.png`)}`;
}
