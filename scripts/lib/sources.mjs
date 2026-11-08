/**
 * 外部資料來源與共用的抓取／解析工具。
 * 抓資料（fetch-data.mjs）與回填變動日誌（backfill-changelog.mjs）共用同一份，
 * 免得兩邊的來源網址或正規化規則各自漂移。
 */

/** 所有外部來源集中在這裡，方便稽核 */
export const SOURCES = {
  gamemaster: {
    url: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.min.json',
    repo: 'pvpoke/pvpoke',
    license: 'MIT',
    /** 回填歷史時要逐個 commit 取同一個檔案，所以把路徑也記下來 */
    path: 'src/data/gamemaster.min.json',
  },
  rankings: {
    base: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall',
    leagues: [
      { cp: 1500, key: 'great', name: '超級聯盟' },
      { cp: 2500, key: 'ultra', name: '高級聯盟' },
      { cp: 10000, key: 'master', name: '大師聯盟' },
    ],
  },
  commitsApi: 'https://api.github.com/repos/pvpoke/pvpoke/commits?per_page=1',
  /** 逐檔案的 commit 歷史，回填變動日誌用 */
  fileCommitsApi: (path, perPage = 100) =>
    `https://api.github.com/repos/pvpoke/pvpoke/commits?path=${encodeURIComponent(path)}&per_page=${perPage}`,
  /** 某個 commit 當下的檔案內容 */
  rawAt: (sha, path) => `https://raw.githubusercontent.com/pvpoke/pvpoke/${sha}/${path}`,
  /**
   * 中文名有兩個來源，順序有意義：
   *   1. PokeMiners 的 GO 繁中文字檔 —— 就是遊戲裡會看到的字，優先採用。
   *      缺點是文字檔本身更新慢（最近一次 2025-08），新內容查不到。
   *   2. PokeAPI 的官方譯名 CSV —— 跟著本傳更新，補上 1 的空缺。
   * 兩邊都查不到就由硬檢查擋下來，不會默默留英文。
   */
  zhNames: {
    goEnglish: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/English.txt',
    goChinese: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/ChineseTraditional.txt',
    apiSpecies: 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv',
    apiMoves: 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/move_names.csv',
    /** PokeAPI languages.csv 裡 zh-hant 的 id */
    apiLang: '4',
    /** PokeAPI languages.csv 裡 en 的 id */
    apiLangEn: '9',
  },
};

/** 遊戲內 18 屬性，用來擋掉資料源冒出沒看過的屬性 */
export const TYPES = ['normal','fighting','flying','poison','ground','rock','bug','ghost','steel','fire','water','grass','electric','psychic','ice','dragon','dark','fairy'];

const UA = { 'User-Agent': 'pokemon-go-battles-datafetch' };

/**
 * 下載文字，失敗重試。
 * @param {string} url
 * @param {number} [retries=3]
 * @returns {Promise<string>}
 */
export async function fetchText(url, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error(`抓取失敗 ${url}: ${lastErr.message}`);
}

/**
 * 下載 JSON，失敗重試。
 * @param {string} url
 * @param {number} [retries=3]
 * @returns {Promise<{data: unknown, bytes: number}>}
 */
export async function fetchJson(url, retries = 3) {
  const text = await fetchText(url, retries);
  return { data: JSON.parse(text), bytes: Buffer.byteLength(text) };
}

/**
 * 解析 PokeMiners 的文字檔。格式是一段段的
 * `RESOURCE ID: <key>\r\nTEXT: <value>`，中間空一行。
 * @param {string} raw
 * @returns {Map<string, string>}
 */
export function parseGoTexts(raw) {
  const map = new Map();
  const text = raw.replace(/\r\n/g, '\n');
  const re = /RESOURCE ID: (.+)\nTEXT: ([\s\S]*?)(?=\n\nRESOURCE ID: |\n*$)/g;
  let m;
  while ((m = re.exec(text))) map.set(m[1].trim(), m[2].trim());
  return map;
}

/**
 * 解析 PokeAPI 的 CSV。只讀前三欄，而且那三欄不會出現引號包住的逗號。
 * @param {string} raw
 * @returns {string[][]} 不含表頭
 */
export function parseCsv(raw) {
  return raw.trim().split(/\r?\n/).slice(1).map((line) => line.split(','));
}

/** 招式名用正規化後的英文當鍵，避免大小寫與標點差異對不上 */
export const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** 判斷一個字串有沒有中日韓文字；文字檔裡有些條目沒翻譯，值還是英文 */
export const hasCjk = (s) => /[㐀-鿿豈-﫿]/.test(s);

/**
 * CP 計算，公式同 pvpoke Pokemon.js calculateCP。
 * @param {{atk: number, def: number, hp: number}} base
 * @param {number[]} ivs
 * @param {number} cpm
 */
export function calcCP(base, ivs, cpm) {
  return Math.floor(
    ((base.atk + ivs[0]) * Math.sqrt(base.def + ivs[1]) * Math.sqrt(base.hp + ivs[2]) * cpm * cpm) / 10
  );
}
