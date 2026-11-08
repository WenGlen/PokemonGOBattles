import cpmData from '../../data/cpm.json';
import type { PokemonData } from './types';
import { MULT } from './typeChart';

const CPM: number[] = cpmData.values;

/** 等級換算成 CP Multiplier 的索引（等級 1 起、每 0.5 一階） */
export function cpmForLevel(level: number): number {
  return CPM[Math.round((level - 1) * 2)] ?? CPM[CPM.length - 1];
}

/** 公式同 pvpoke Pokemon.js calculateCP */
export function calcCP(base: [number, number, number], ivs: [number, number, number], level: number): number {
  const cpm = cpmForLevel(level);
  return Math.floor(
    ((base[0] + ivs[0]) * Math.sqrt(base[1] + ivs[1]) * Math.sqrt(base[2] + ivs[2]) * cpm * cpm) / 10
  );
}

export interface BattleStats {
  atk: number;
  def: number;
  hp: number;
  cp: number;
}

/**
 * 算出實戰三圍。攻防保留小數（遊戲內不取整），HP 取整且最低 10。
 * @param shadow 暗影寶可夢：攻擊 ×1.2、防禦 ×0.8333
 */
export function battleStats(
  base: [number, number, number],
  ivs: [number, number, number],
  level: number,
  shadow = false
): BattleStats {
  const cpm = cpmForLevel(level);
  return {
    atk: cpm * (base[0] + ivs[0]) * (shadow ? MULT.SHADOW_ATK : 1),
    def: cpm * (base[1] + ivs[1]) * (shadow ? MULT.SHADOW_DEF : 1),
    hp: Math.max(Math.floor(cpm * (base[2] + ivs[2])), 10),
    cp: calcCP(base, ivs, level),
  };
}

/** 各聯盟的 CP 上限與在 gamemaster 裡對應的建議 IV 欄位 */
export const LEAGUES = [
  { cp: 1500, name: '超級聯盟', ivKey: 'cp1500' },
  { cp: 2500, name: '高級聯盟', ivKey: 'cp2500' },
  { cp: 10000, name: '大師聯盟', ivKey: '' },
] as const;

export type LeagueCp = (typeof LEAGUES)[number]['cp'];

/**
 * 取某隻寶可夢在某聯盟的建議等級與 IV。
 *
 * 超級／高級直接用 pvpoke 算好的 defaultIVs（和官網同一組數字，方便對帳）；
 * 大師聯盟沒有 CP 上限，固定 50 級 15/15/15。
 */
export function suggestedBuild(
  p: PokemonData,
  cp: LeagueCp
): { level: number; ivs: [number, number, number] } {
  if (cp === 10000) return { level: 50, ivs: [15, 15, 15] };
  const key = cp === 1500 ? 'cp1500' : 'cp2500';
  const d = p.iv?.[key];
  if (d) return { level: d[0], ivs: [d[1], d[2], d[3]] };
  return { level: 40, ivs: [15, 15, 15] };
}
