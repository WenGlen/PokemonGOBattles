import typeZh from '../../data/type-zh.json';
/**
 * 屬性相剋表與傷害倍率常數。
 * 數值完全照搬 pvpoke/pvpoke src/js/battle/DamageCalculator.js（MIT），
 * 包含 Niantic 的浮點數尾數——那些尾數會影響 floor 後的結果，不可以四捨五入。
 */

export const MULT = {
  BONUS: 1.2999999523162841796875,
  SUPER_EFFECTIVE: 1.60000002384185791015625,
  RESISTED: 0.625,
  DOUBLE_RESISTED: 0.390625,
  STAB: 1.2000000476837158203125,
  SHADOW_ATK: 1.2,
  SHADOW_DEF: 0.83333331,
} as const;

/** 每個防禦屬性的弱點／抗性／免疫（對應攻擊屬性） */
const TRAITS: Record<string, { weak: string[]; resist: string[]; immune: string[] }> = {
  normal:   { weak: ['fighting'], resist: [], immune: ['ghost'] },
  fighting: { weak: ['flying', 'psychic', 'fairy'], resist: ['rock', 'bug', 'dark'], immune: [] },
  flying:   { weak: ['rock', 'electric', 'ice'], resist: ['fighting', 'bug', 'grass'], immune: ['ground'] },
  poison:   { weak: ['ground', 'psychic'], resist: ['fighting', 'poison', 'bug', 'fairy', 'grass'], immune: [] },
  ground:   { weak: ['water', 'grass', 'ice'], resist: ['poison', 'rock'], immune: ['electric'] },
  rock:     { weak: ['fighting', 'ground', 'steel', 'water', 'grass'], resist: ['normal', 'flying', 'poison', 'fire'], immune: [] },
  bug:      { weak: ['flying', 'rock', 'fire'], resist: ['fighting', 'ground', 'grass'], immune: [] },
  ghost:    { weak: ['ghost', 'dark'], resist: ['poison', 'bug'], immune: ['normal', 'fighting'] },
  steel:    { weak: ['fighting', 'ground', 'fire'], resist: ['normal', 'flying', 'rock', 'bug', 'steel', 'grass', 'psychic', 'ice', 'dragon', 'fairy'], immune: ['poison'] },
  fire:     { weak: ['ground', 'rock', 'water'], resist: ['bug', 'steel', 'fire', 'grass', 'ice', 'fairy'], immune: [] },
  water:    { weak: ['grass', 'electric'], resist: ['steel', 'fire', 'water', 'ice'], immune: [] },
  grass:    { weak: ['flying', 'poison', 'bug', 'fire', 'ice'], resist: ['ground', 'water', 'grass', 'electric'], immune: [] },
  electric: { weak: ['ground'], resist: ['flying', 'steel', 'electric'], immune: [] },
  psychic:  { weak: ['bug', 'ghost', 'dark'], resist: ['fighting', 'psychic'], immune: [] },
  ice:      { weak: ['fighting', 'fire', 'steel', 'rock'], resist: ['ice'], immune: [] },
  dragon:   { weak: ['dragon', 'ice', 'fairy'], resist: ['fire', 'water', 'grass', 'electric'], immune: [] },
  dark:     { weak: ['fighting', 'fairy', 'bug'], resist: ['ghost', 'dark'], immune: ['psychic'] },
  fairy:    { weak: ['poison', 'steel'], resist: ['fighting', 'bug', 'dark'], immune: ['dragon'] },
};

/**
 * 算出招式對某組防禦屬性的最終倍率。
 * @param moveType 攻擊屬性
 * @param targetTypes 防禦方的屬性（1 或 2 個）
 */
export function effectiveness(moveType: string, targetTypes: string[]): number {
  let mult = 1;
  const atk = moveType.toLowerCase();
  for (const t of targetTypes) {
    const traits = TRAITS[t.toLowerCase()];
    if (!traits) continue;
    if (traits.weak.includes(atk)) mult *= MULT.SUPER_EFFECTIVE;
    else if (traits.resist.includes(atk)) mult *= MULT.RESISTED;
    else if (traits.immune.includes(atk)) mult *= MULT.DOUBLE_RESISTED;
  }
  return mult;
}

/**
 * 倍率落在哪一桶：2 = 雙重被剋、1 = 被剋、0 = 普通、−1 = 抵抗、−2 = 雙重抵抗（含免疫）。
 *
 * 要分類一律用這個，不要自己拿倍率去跟 1 或 1.6 比大小。
 * 上面那些常數帶著 Niantic 的浮點尾數：SUPER_EFFECTIVE 其實是
 * 1.60000002384185791015625，於是
 *
 *   · 1.6 × 0.625 = 1.0000000149…  →「被剋一次又抵抗一次」的中性組合比 1 大，
 *     被當成被剋。勾魂眼（幽靈／惡）多出來的蟲、幽靈、惡就是這樣來的，
 *     巨沼怪（水／地面）多出來的水、冰也是。
 *   · 1.6 > 1.6 為真 → 單純被剋會被當成雙重被剋。
 *
 * 尾數不能四捨五入掉（傷害 floor 之後的結果會變），所以留著常數、改比較方式：
 * 每一桶之間的差距都很大（1.0 比 1.6、0.625 比 0.390625），
 * 取中間值當門檻，尾數再怎麼跑都不會跨過去。
 *
 * @param mult effectiveness() 的輸出。不可以含本系加成——STAB 也帶著同樣的尾數。
 */
export function effBucket(mult: number): -2 | -1 | 0 | 1 | 2 {
  if (mult > 2) return 2;
  if (mult > 1.3) return 1;
  if (mult < 0.5) return -2;
  if (mult < 0.8) return -1;
  return 0;
}

/** 18 屬性的中文名。唯一來源是 data/type-zh.json，抓資料腳本也讀同一份。 */
export const TYPE_ZH: Record<string, string> = typeZh;
