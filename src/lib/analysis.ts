/**
 * 表格與隊伍分析要用的推導數值。
 *
 * 這裡全是純函式，資料從 gamemaster 與排名來，不另外打網路。
 */

import { simulate } from './battle';
import { effBucket, effectiveness, MULT, TYPE_ZH } from './typeChart';
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
  const b = effBucket(mult);
  if (b >= 2) return '雙重剋制';
  if (b === 1) return '剋制';
  if (b <= -2) return '雙重抵抗';
  if (b === -1) return '抵抗';
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
      weak: each.filter((m) => effBucket(m) > 0).length,
      resist: each.filter((m) => effBucket(m) < 0).length,
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
      hits: team.filter((p) => effBucket(effectiveness(move.type, p.types)) > 0).length,
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

/* ── 單隻寶可夢的解析 ─────────────────────────────── */

/** 防守面：挨打時的屬性優劣 */
export interface DefenseProfile {
  /** 雙重被剋（×2.56） */
  weak2: string[];
  /** 被剋（×1.6） */
  weak: string[];
  /** 抵抗（×0.625） */
  resist: string[];
  /** 雙重抵抗或免疫（×0.39 以下） */
  resist2: string[];
}

/**
 * 這組屬性挨各種攻擊的結果，分桶。
 * @param types 防守方的屬性
 */
export function defenseProfile(types: string[]): DefenseProfile {
  const out: DefenseProfile = { weak2: [], weak: [], resist: [], resist2: [] };
  for (const t of ALL_TYPES) {
    const b = effBucket(effectiveness(t, types));
    if (b >= 2) out.weak2.push(t);
    else if (b === 1) out.weak.push(t);
    else if (b <= -2) out.resist2.push(t);
    else if (b === -1) out.resist.push(t);
  }
  return out;
}

/** 攻擊面：這隻的招式能打到誰、打不動誰 */
export interface OffenseProfile {
  /**
   * 對每個單屬性對手，這隻最好的一招。
   * eff 是純相剋倍率，mult 再乘上本系加成——分桶看 eff、顯示看 mult。
   */
  best: Record<string, { eff: number; mult: number; move: MoveData }>;
  /** 有招打得出剋制的屬性 */
  strong: string[];
  /** 所有招都被抵抗的屬性 */
  weak: string[];
  /** 這隻實際帶得出來的攻擊屬性 */
  coverage: string[];
}

/**
 * 招式的屬性覆蓋。
 *
 * 看的是「對單屬性對手，牠最好的一招能打出多少倍」——
 * 本系加成算進去，因為那是實戰真的會有的傷害差。
 *
 * @param p 寶可夢
 * @param moveById 招式查表
 * @param pool 只看這些招（預設是牠學得會的全部）
 */
export function offenseProfile(
  p: PokemonData,
  moveById: Map<string, MoveData>,
  pool?: string[]
): OffenseProfile {
  const moves = (pool ?? [...p.fast, ...p.charged])
    .map((id) => moveById.get(id))
    .filter(Boolean) as MoveData[];
  const best: OffenseProfile['best'] = {};
  for (const target of ALL_TYPES) {
    let top: OffenseProfile['best'][string] | null = null;
    for (const m of moves) {
      const stab = p.types.includes(m.type) ? MULT.STAB : 1;
      const eff = effectiveness(m.type, [target]);
      const mult = eff * stab;
      if (!top || mult > top.mult) top = { eff, mult, move: m };
    }
    if (top) best[target] = top;
  }
  // 分桶一定要看純相剋倍率，不能看含本系的那個。
  // MULT.STAB 是 1.2000000476837158…（Niantic 的浮點尾數），
  // 拿它跟 1.2 比大小，每一個「本系打中性」都會被誤判成剋制。
  return {
    best,
    strong: ALL_TYPES.filter((t) => best[t] && effBucket(best[t].eff) > 0),
    weak: ALL_TYPES.filter((t) => best[t] && effBucket(best[t].eff) < 0),
    coverage: [...new Set(moves.map((m) => m.type))],
  };
}

/** 標籤門檻：從這個聯盟上榜的那一批算出來，不是寫死的數字 */
export interface TagContext {
  bulk: { p20: number; p80: number };
  atk: { p20: number; p80: number };
  ept: { p80: number };
  dpt: { p80: number };
}

/** 取分位數 */
function quantile(values: number[], t: number): number {
  const v = [...values].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * t))] ?? 0;
}

/**
 * 從聯盟上榜名單算出標籤門檻。
 *
 * 寫死「耐久大於 18000 算肉盾」這種數字，換個聯盟就不成立；
 * 改成跟同聯盟的其他人比，標籤才一直有意義。
 *
 * @param pool 上榜寶可夢在這個聯盟的實戰數值
 */
export function buildTagContext(
  pool: { atk: number; def: number; hp: number; ept: number; dpt: number }[]
): TagContext {
  const bulks = pool.map((x) => x.def * x.hp);
  const atks = pool.map((x) => x.atk);
  return {
    bulk: { p20: quantile(bulks, 0.2), p80: quantile(bulks, 0.8) },
    atk: { p20: quantile(atks, 0.2), p80: quantile(atks, 0.8) },
    ept: { p80: quantile(pool.map((x) => x.ept), 0.8) },
    dpt: { p80: quantile(pool.map((x) => x.dpt), 0.8) },
  };
}

export interface RoleTag {
  label: string;
  /** good = 優點、bad = 缺點、plain = 中性描述 */
  tone: 'good' | 'bad' | 'plain';
  /** 滑過去看到的依據，數字都寫出來才查得了 */
  why: string;
}

/**
 * 這隻的定位標籤。
 *
 * 每個標籤都附上判斷依據——不講清楚「肉盾」是跟誰比、門檻多少，
 * 這種標籤就只是感覺，沒辦法驗。
 */
export function roleTags(
  p: PokemonData,
  st: { atk: number; def: number; hp: number },
  moveById: Map<string, MoveData>,
  ctx: TagContext
): RoleTag[] {
  const tags: RoleTag[] = [];
  const fasts = p.fast.map((id) => moveById.get(id)).filter(Boolean) as MoveData[];
  const chargeds = p.charged.map((id) => moveById.get(id)).filter(Boolean) as MoveData[];
  const bulk = st.def * st.hp;
  const bestEpt = Math.max(0, ...fasts.map((m) => fastRates(m).ept));
  const bestDpt = Math.max(0, ...fasts.map((m) => fastRates(m).dpt));
  const n = (x: number) => Math.round(x).toLocaleString();

  // ── 體質 ──
  const tanky = bulk >= ctx.bulk.p80;
  const frail = bulk <= ctx.bulk.p20;
  const hitsHard = st.atk >= ctx.atk.p80;
  if (hitsHard && frail) {
    tags.push({ tone: 'plain', label: '玻璃炮', why: `攻擊 ${st.atk.toFixed(1)} 在同聯盟前 20%，但耐久 ${n(bulk)} 在後 20%` });
  } else {
    if (tanky) tags.push({ tone: 'good', label: '肉盾', why: `耐久（防禦×HP）${n(bulk)}，同聯盟前 20%（門檻 ${n(ctx.bulk.p80)}）` });
    if (frail) tags.push({ tone: 'bad', label: '脆', why: `耐久 ${n(bulk)}，同聯盟後 20%（門檻 ${n(ctx.bulk.p20)}）` });
    if (hitsHard) tags.push({ tone: 'good', label: '高攻', why: `攻擊 ${st.atk.toFixed(1)}，同聯盟前 20%（門檻 ${ctx.atk.p80.toFixed(1)}）` });
  }

  // ── 快招 ──
  if (fasts.some((m) => m.turns === 1)) {
    tags.push({ tone: 'good', label: '出招快', why: '有 1 回合（0.5 秒）的快招，搶 CMP 與反應都佔便宜' });
  }
  if (bestEpt >= ctx.ept.p80) {
    tags.push({ tone: 'good', label: '充能快', why: `最佳快招每回合 ${bestEpt.toFixed(2)} 能量，同聯盟前 20%（門檻 ${ctx.ept.p80.toFixed(2)}）` });
  }
  if (bestDpt >= ctx.dpt.p80) {
    tags.push({ tone: 'good', label: '快招就會痛', why: `最佳快招每回合 ${bestDpt.toFixed(2)} 傷害，同聯盟前 20%（門檻 ${ctx.dpt.p80.toFixed(2)}）` });
  }

  // ── 大招 ──
  const energies = chargeds.map((m) => m.energy).filter((e) => e > 0);
  const cheapest = energies.length ? Math.min(...energies) : 0;
  if (cheapest && cheapest <= 35) {
    tags.push({ tone: 'good', label: '大招便宜', why: `最便宜的大招只要 ${cheapest} 能量，壓力給得快` });
  }
  const bestDpe = Math.max(0, ...chargeds.map((m) => dpe(m)));
  if (bestDpe >= 2) {
    tags.push({ tone: 'good', label: '高爆發', why: `最佳大招每點能量 ${bestDpe.toFixed(2)} 傷害（DPE ≥ 2 算高）` });
  }
  if (energies.length >= 2 && Math.max(...energies) - cheapest >= 15) {
    tags.push({ tone: 'good', label: '誘餌好用', why: `便宜 ${cheapest} 與最貴 ${Math.max(...energies)} 能量差 ${Math.max(...energies) - cheapest}，騙盾空間大` });
  }
  const selfBuff = chargeds.find((m) => m.buffTarget === 'self' && m.buffs && (m.buffs[0] > 0 || m.buffs[1] > 0));
  if (selfBuff) tags.push({ tone: 'good', label: '自帶強化', why: `${zhOf(selfBuff)} 會提升自己的能力` });
  const debuff = chargeds.find((m) => m.buffTarget !== 'self' && m.buffs && (m.buffs[0] < 0 || m.buffs[1] < 0));
  if (debuff) tags.push({ tone: 'good', label: '能降對手', why: `${zhOf(debuff)} 會降低對手的能力` });
  const selfDebuff = chargeds.every((m) => m.buffTarget === 'self' && m.buffs && (m.buffs[0] < 0 || m.buffs[1] < 0));
  if (chargeds.length > 0 && selfDebuff) {
    tags.push({ tone: 'bad', label: '丟招有代價', why: '所有大招丟出去都會降自己的能力，不能亂丟' });
  }

  // ── 屬性 ──
  const d = defenseProfile(p.types);
  const weakCount = d.weak.length + d.weak2.length;
  if (weakCount <= 2) tags.push({ tone: 'good', label: '弱點少', why: `只被 ${weakCount} 種屬性剋` });
  if (weakCount >= 5) tags.push({ tone: 'bad', label: '弱點多', why: `被 ${weakCount} 種屬性剋` });
  if (d.resist.length + d.resist2.length >= 7) {
    tags.push({ tone: 'good', label: '抗性廣', why: `抵抗 ${d.resist.length + d.resist2.length} 種屬性` });
  }
  if (d.weak2.length) {
    tags.push({ tone: 'bad', label: '有雙重弱點', why: `被 ${d.weak2.map((t) => TYPE_ZH[t]).join('、')} 打到 ×2.56` });
  }

  return tags;
}

/** 招式的顯示名，沒有中文就退回英文 */
const zhOf = (m: MoveData) => m.zh || m.name;
