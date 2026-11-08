/**
 * 表格與隊伍分析要用的推導數值。
 *
 * 這裡全是純函式，資料從 gamemaster 與排名來，不另外打網路。
 */

import { simulate } from './battle';
import { effectiveness, MULT, TYPE_ZH } from './typeChart';
import type { Loadout, MoveData, PokemonData } from './types';

/** 一招快招的每回合傷害與每回合能量——PvP 評估快招就看這兩個數字 */
export function fastRates(m: MoveData): { dpt: number; ept: number } {
  const turns = Math.max(1, m.turns);
  return { dpt: m.power / turns, ept: m.energyGain / turns };
}

/** 大招的每點能量傷害：同樣能量能打多少，決定值不值得丟 */
export function dpe(m: MoveData): number {
  return m.energy > 0 ? m.power / m.energy : 0;
}

/** 快招與大招的分界：有能量獲得的是快招 */
export const isFast = (m: MoveData): boolean => m.energyGain > 0;

/** 18 屬性，表格欄位順序固定 */
export const ALL_TYPES = Object.keys(TYPE_ZH);

/**
 * 這組屬性挨各種屬性攻擊時的倍率。
 * @param types 防守方的屬性
 * @returns 攻擊屬性 → 倍率
 */
export function damageTakenBy(types: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of ALL_TYPES) out[t] = effectiveness(t, types);
  return out;
}

/** 倍率轉成好讀的標籤。數值直接來自 typeChart 的常數，不自己寫死。 */
export function effLabel(mult: number): string {
  if (mult >= MULT.SUPER_EFFECTIVE * MULT.SUPER_EFFECTIVE) return '雙重剋制';
  if (mult > 1) return '剋制';
  if (mult <= MULT.DOUBLE_RESISTED) return '雙重抵抗';
  if (mult < 1) return '抵抗';
  return '普通';
}

/** 一支隊伍對某個攻擊屬性的整體處境 */
export interface TypePressure {
  type: string;
  /** 隊上每一隻挨這個屬性的倍率，順序同隊伍 */
  each: number[];
  /** 幾隻被剋 */
  weak: number;
  /** 幾隻能抵抗 */
  resist: number;
  /** 這個屬性的招式在主流裡出現的機率（0–1），由使用率推估 */
  encounter: number;
}

/**
 * 隊伍的屬性弱點盤點。
 * @param team 三隻的資料
 * @param encounterByType 各屬性招式的遇到率，沒有就都當 0
 */
export function teamTypePressure(
  team: PokemonData[],
  encounterByType: Record<string, number> = {}
): TypePressure[] {
  return ALL_TYPES.map((type) => {
    const each = team.map((p) => effectiveness(type, p.types));
    return {
      type,
      each,
      weak: each.filter((m) => m > 1).length,
      resist: each.filter((m) => m < 1).length,
      encounter: encounterByType[type] ?? 0,
    };
  });
}

/** 排名裡的一列（含主流的招式使用率） */
export interface RankRow {
  id: string;
  score: number;
  moveset: string[];
  /** 只有前 100 名有：f = 快招、c = 大招，每筆 [招式 id, 使用百分比] */
  use?: { f: [string, number][]; c: [string, number][] };
}

/** 一個招式在主流裡的出現情況 */
export interface MoveExposure {
  move: MoveData;
  /** 預期遇到率 0–1：把每隻主流寶可夢帶這招的機率平均起來 */
  rate: number;
  /** 哪些主流寶可夢會帶，依排名排序 */
  users: { id: string; zh: string; icon: string; rank: number; pct: number }[];
  /** 這招打在隊上，幾隻會被剋 */
  hits: number;
}

/**
 * 推估「對手可能帶什麼招」。
 *
 * 用的是 pvpoke 統計的實際使用次數，不是「牠學得會什麼」——
 * 學得會但沒人帶的招，列出來只會洗版。
 *
 * @param rows 這個聯盟的排名（前 100 名才有使用率）
 * @param monById 查中文名與圖示用
 * @param moveById 查招式
 * @param team 我方隊伍，用來算這招會打到幾隻
 * @param topN 只看前幾名當作主流
 */
export function moveExposure(
  rows: RankRow[],
  monById: Map<string, PokemonData>,
  moveById: Map<string, MoveData>,
  team: PokemonData[],
  topN = 50
): MoveExposure[] {
  const meta = rows.slice(0, topN).filter((r) => r.use);
  if (!meta.length) return [];
  /** 招式 id → 累積機率與使用者 */
  const acc = new Map<string, { sum: number; users: MoveExposure['users'] }>();

  meta.forEach((r, i) => {
    const p = monById.get(r.id);
    if (!p) return;
    for (const [moveId, pct] of [...(r.use!.f ?? []), ...(r.use!.c ?? [])]) {
      if (!acc.has(moveId)) acc.set(moveId, { sum: 0, users: [] });
      const e = acc.get(moveId)!;
      e.sum += pct / 100;
      e.users.push({ id: p.id, zh: p.zh, icon: p.icon, rank: i + 1, pct });
    }
  });

  const out: MoveExposure[] = [];
  for (const [moveId, e] of acc) {
    const move = moveById.get(moveId);
    if (!move) continue;
    e.users.sort((a, b) => a.rank - b.rank);
    out.push({
      move,
      rate: e.sum / meta.length,
      users: e.users,
      hits: team.filter((p) => effectiveness(move.type, p.types) > 1).length,
    });
  }
  return out.sort((a, b) => b.rate - a.rate);
}

/**
 * 各屬性的遇到率：把同屬性招式的遇到率加起來，上限 1。
 * @param exposure moveExposure 的結果
 */
export function encounterByType(exposure: MoveExposure[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of ALL_TYPES) out[t] = 0;
  for (const e of exposure) out[e.move.type] = Math.min(1, (out[e.move.type] ?? 0) + e.rate);
  return out;
}

/** 一個主流威脅對我方隊伍的結果 */
export interface Threat {
  id: string;
  zh: string;
  icon: string;
  shadow: boolean;
  rank: number;
  /** 打贏我方幾隻 */
  beats: number;
  /**
   * 對每一隻的結果，順序同隊伍。
   * rating 是「放在面板上那三隻」的評分，oppRating 是這一列這隻的評分；
   * 對手模式下要顯示的是後者，不然畫面上會出現「贏 182」這種讀不通的組合。
   */
  vs: { rating: number; oppRating: number; win: boolean }[];
  /** 平均評分，越低代表我方越吃虧 */
  avg: number;
  /** 牠帶的招，展開那一列時顯示 */
  moves: MoveData[];
}

/**
 * 掃一遍主流，看誰打得贏我方整隊。
 *
 * 用自己的模擬器跑，所以會照使用者實際選的招式與護盾；
 * 代價是出招決策只到 pvpoke 演算法的簡化版（方向一致率約 80%），
 * 所以這份名單當「優先注意」用，不是判決。
 *
 * @param team 我方三隻的完整設定
 * @param foes 主流對手的完整設定（已照排名排序）
 */
export function scanThreats(team: Loadout[], foes: { loadout: Loadout; rank: number }[]): Threat[] {
  const out: Threat[] = [];
  for (const f of foes) {
    const vs = team.map((mine) => {
      // a = 我方、b = 對手，rating.a > 500 代表我方佔上風
      const r = simulate(mine, f.loadout);
      return { rating: r.analysis.rating.a, oppRating: r.analysis.rating.b, win: r.analysis.rating.a > 500 };
    });
    const beats = vs.filter((v) => !v.win).length;
    out.push({
      id: f.loadout.pokemon.id,
      zh: f.loadout.pokemon.zh,
      icon: f.loadout.pokemon.icon,
      shadow: Boolean(f.loadout.pokemon.shadow),
      rank: f.rank,
      beats,
      vs,
      avg: vs.reduce((n, v) => n + v.rating, 0) / (vs.length || 1),
      moves: [f.loadout.fastMove, ...f.loadout.chargedMoves],
    });
  }
  return out.sort((a, b) => b.beats - a.beats || a.avg - b.avg);
}
