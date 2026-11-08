/**
 * 圖示網址。
 *
 * 圖片不放進這個 repo——那些是 Niantic 的美術資產，PokeMiners 只是從 APK 挖出來；
 * 我們只存識別碼，執行時由 CDN 取，所以這個專案不重新散布任何美術檔。
 *
 * 用 statically.io 而不是 jsDelivr：jsDelivr 對整個 repo 有 50 MB 上限，
 * pogo_assets 遠超過，會零星回 403。失敗時退回 raw.githubusercontent。
 *
 * 這份常數和 scripts/lib/icons.mjs 是同一組，改了要兩邊一起改。
 */

const CDN = 'https://cdn.statically.io/gh';
const RAW = 'https://raw.githubusercontent.com';

const PATHS = {
  go: 'PokeMiners/pogo_assets/master/Images/Pokemon/Addressable Assets',
  home: 'PokeAPI/sprites/master/sprites/pokemon/other/home',
  type: 'PokeMiners/pogo_assets/master/Images/Types',
};

/**
 * 寶可夢圖示。
 * @param icon 識別碼，例如 `go:pm487.fORIGIN`、`home:778`
 * @param raw true 時走 raw.githubusercontent，給 CDN 失敗時退回用
 */
export function pokemonIconUrl(icon: string, raw = false): string {
  const base = raw ? RAW : CDN;
  const [src, id] = icon.split(':');
  return src === 'home'
    ? `${base}/${PATHS.home}/${id}.png`
    : `${base}/${PATHS.go}/${encodeURIComponent(`${id}.icon.png`)}`;
}

/**
 * 屬性圖示。招式沒有自己的美術——遊戲裡招式就是用屬性圖示表示，所以共用這一個。
 * @param type 小寫屬性名，例如 `fire`
 * @param raw true 時走 raw.githubusercontent
 */
export function typeIconUrl(type: string, raw = false): string {
  return `${raw ? RAW : CDN}/${PATHS.type}/POKEMON_TYPE_${type.toUpperCase()}.png`;
}

/** 18 屬性的代表色，圖示載入前先用它墊底，避免版面跳動 */
export const TYPE_COLOR: Record<string, string> = {
  normal: '#9fa19f', fighting: '#ff8000', flying: '#81b9ef', poison: '#9141cb',
  ground: '#915121', rock: '#afa981', bug: '#91a119', ghost: '#704170',
  steel: '#60a1b8', fire: '#e62829', water: '#2980ef', grass: '#3fa129',
  electric: '#fac000', psychic: '#ef4179', ice: '#3dcef3', dragon: '#5060e1',
  dark: '#50413f', fairy: '#ef70ef',
};
