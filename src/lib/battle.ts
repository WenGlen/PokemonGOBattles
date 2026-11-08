/**
 * Pokémon GO 對戰模擬器（2026-06-23 新版系統）。
 *
 * 五條規則完全照官方公告 https://pokemongo.com/news/pvp-updates2026：
 *
 *  1. 傷害與能量在「回合結束」結算 → 同回合的 1 回合快招會平手，雙方都生效。
 *  2. 交換永遠先於傷害結算。（1v1 demo 不含交換，保留介面）
 *  3. 快速交換 1 回合、強制交換 0 回合、大招結束時的交換 0 回合。
 *  4. 大招在「下一回合開始」才發動——舊系統是立刻發動，這條差最多。
 *  5. 大招的傷害與能力變化一定在 leak 進來的快招「之前」結算；
 *     sneak 快招只能發生在大招被按下的那一個回合。
 *
 * 傷害公式與屬性倍率沿用 pvpoke（MIT），細節見 typeChart.ts。
 */

import { zhName, type Loadout, type MoveData } from './types';
import { MULT, effectiveness } from './typeChart';
import { battleStats, type BattleStats } from './stats';

/** 1 回合 = 500 毫秒 */
export const TURN_MS = 500;
/** GBL 單場 240 秒 */
const MAX_TURNS = 480;

export type SideKey = 'a' | 'b';

interface Side {
  key: SideKey;
  loadout: Loadout;
  base: BattleStats;
  hp: number;
  maxHp: number;
  energy: number;
  shields: number;
  atkStage: number;
  defStage: number;
  /** 進行中的快招：resolveTurn 回合結束時結算 */
  pendingFast: { move: MoveData; startTurn: number; resolveTurn: number } | null;
  /** 已按下的大招：規則 4，resolveTurn = 按下的下一回合 */
  pendingCharged: { move: MoveData; triggerTurn: number; resolveTurn: number } | null;
  faintSource: 'fast' | 'charged' | null;
  /** 統計用 */
  fastCount: number;
  chargedCount: number;
  damageDealt: number;
}

export type BattleEvent =
  | { kind: 'fast'; side: SideKey; move: string; moveType: string; damage: number; energyGain: number; startTurn: number }
  | { kind: 'charged'; side: SideKey; move: string; moveType: string; damage: number; shielded: boolean; energyCost: number; buffText?: string; cmpWin?: boolean }
  | { kind: 'trigger'; side: SideKey; move: string; moveType: string; energyCost: number }
  | { kind: 'faint'; side: SideKey }
  | { kind: 'note'; side: SideKey | null; text: string };

export interface Snapshot {
  hp: number;
  maxHp: number;
  energy: number;
  shields: number;
  atkStage: number;
  defStage: number;
  /** 這回合正在蓄快招的進度，例如 2 回合招的 1/2 */
  fastProgress: [number, number] | null;
}

export interface TurnRecord {
  turn: number;
  /** 戰鬥經過秒數 */
  seconds: number;
  events: BattleEvent[];
  a: Snapshot;
  b: Snapshot;
  /** 這回合是大招結算回合（雙方都不能開新動作） */
  chargedWindow: boolean;
}

export interface BattleResult {
  turns: TurnRecord[];
  winner: SideKey | 'draw';
  /** 分出勝負的回合 */
  endTurn: number;
  analysis: {
    /** 各自最快能丟出第一發大招的回合（純能量計算，不含實戰干擾） */
    firstChargedTurn: Record<SideKey, { turn: number; move: string; fastNeeded: number } | null>;
    /** CMP（同回合都丟大招時誰先出手）——攻擊力高的贏 */
    cmpWinner: SideKey | 'tie';
    cmpAtk: Record<SideKey, number>;
    /** 各自一次快招對對方的傷害 */
    fastDamage: Record<SideKey, number>;
    /** 對方一發大招會不會直接帶走你 */
    hpLeft: Record<SideKey, number>;
    rating: Record<SideKey, number>;
  };
}

/** 能力階級換算成倍率：+1 → 1.25、-1 → 0.8（maxBuffStages 4、buffDivisor 4） */
function stageMultiplier(stage: number): number {
  const s = Math.max(-4, Math.min(4, stage));
  return s >= 0 ? (4 + s) / 4 : 4 / (4 - s);
}

function effAtk(s: Side): number {
  return s.base.atk * stageMultiplier(s.atkStage);
}
function effDef(s: Side): number {
  return s.base.def * stageMultiplier(s.defStage);
}

/**
 * 傷害公式，與 pvpoke DamageCalculator.damage 等價。
 * @returns 整數傷害，最低 1
 */
export function damage(
  attacker: Side,
  defender: Side,
  move: MoveData,
  atkStageOverride?: number,
  defStageOverride?: number
): number {
  const stab = attacker.loadout.pokemon.types.includes(move.type) ? MULT.STAB : 1;
  const eff = effectiveness(move.type, defender.loadout.pokemon.types);
  const atk = attacker.base.atk * stageMultiplier(atkStageOverride ?? attacker.atkStage);
  const def = defender.base.def * stageMultiplier(defStageOverride ?? defender.defStage);
  return Math.floor(move.power * stab * (atk / def) * eff * 0.5 * MULT.BONUS) + 1;
}

/** 招式會不會讓自己掉攻擊（例如 Superpower）——影響誘餌與開盾判斷 */
function isSelfAttackDebuffing(m: MoveData): boolean {
  return Boolean(m.buffs && m.buffs[0] < 0 && (m.buffTarget ?? 'self') === 'self');
}

function makeSide(key: SideKey, l: Loadout): Side {
  const base = battleStats(l.pokemon.stats, l.ivs, l.level, l.shadow);
  return {
    key,
    loadout: l,
    base,
    hp: base.hp,
    maxHp: base.hp,
    energy: Math.min(100, l.startEnergy ?? 0),
    shields: l.shields,
    atkStage: 0,
    defStage: 0,
    pendingFast: null,
    pendingCharged: null,
    faintSource: null,
    fastCount: 0,
    chargedCount: 0,
    damageDealt: 0,
  };
}

function snap(s: Side, turn: number): Snapshot {
  let fastProgress: [number, number] | null = null;
  if (s.pendingFast && s.pendingFast.move.turns > 1) {
    const done = turn - s.pendingFast.startTurn + 1;
    if (done >= 1 && done < s.pendingFast.move.turns) fastProgress = [done, s.pendingFast.move.turns];
  }
  return {
    hp: Math.max(0, s.hp),
    maxHp: s.maxHp,
    energy: Math.min(100, s.energy),
    shields: s.shields,
    atkStage: s.atkStage,
    defStage: s.defStage,
    fastProgress,
  };
}

/**
 * 估算還能活幾回合（對手全力輸出的情況）。
 * 對應 pvpoke ActionLogic 裡的 turnsToLive 搜尋，簡化成直線推演。
 */
function turnsToLive(self: Side, opp: Side): number {
  const oppFastDmg = damage(opp, self, opp.loadout.fastMove);
  const oppMoves = [...opp.loadout.chargedMoves].sort((a, b) => a.energy - b.energy);
  let hp = self.hp;
  let energy = opp.energy;
  let shields = self.shields;
  let turn = 0;

  for (let guard = 0; guard < 60; guard++) {
    const ready = oppMoves.find((m) => energy >= m.energy);
    if (ready) {
      // 有盾就先擋住最便宜的那一發，沒盾才吃滿
      const pick = shields > 0 ? ready : [...oppMoves].filter((m) => energy >= m.energy).sort((a, b) => damage(opp, self, b) - damage(opp, self, a))[0];
      const dealt = shields > 0 ? 1 : damage(opp, self, pick);
      if (shields > 0) shields -= 1;
      hp -= dealt;
      energy -= pick.energy;
      turn += 2; // 按下 + 發動
      if (hp <= 0) return turn;
      continue;
    }
    hp -= oppFastDmg;
    energy = Math.min(100, energy + opp.loadout.fastMove.energyGain);
    turn += opp.loadout.fastMove.turns;
    if (hp <= 0) return turn;
  }
  return Infinity;
}

/**
 * 對手會不會開盾。
 * 忠實移植 pvpoke ActionLogic.wouldShield（MIT）——這支的判斷直接決定對位勝負，
 * 自己亂寫一套會和官方結果對不上，所以照抄。
 */
function wouldShield(attacker: Side, defender: Side, move: MoveData): boolean {
  if (defender.shields <= 0) return false;

  const dmg = damage(attacker, defender, move);
  const postMoveHP = defender.hp - dmg;

  const buffs = move.buffs ?? [0, 0];
  const atkStage = buffs[0] > 0 ? attacker.atkStage + buffs[0] : attacker.atkStage;
  const defStage = buffs[0] > 0 ? defender.defStage : defender.defStage + (buffs[1] ?? 0);
  const fastDamage = damage(attacker, defender, attacker.loadout.fastMove, atkStage, defStage);

  const fastAttacks =
    Math.ceil((move.energy - Math.max(attacker.energy - move.energy, 0)) / attacker.loadout.fastMove.energyGain) + 1;
  const cycleDamage = (fastAttacks * fastDamage + 1) * defender.shields;

  let useShield = postMoveHP <= cycleDamage;

  const fastDPT = damage(attacker, defender, attacker.loadout.fastMove) / attacker.loadout.fastMove.turns;
  for (const cm of attacker.loadout.chargedMoves) {
    const chargedDamage = damage(attacker, defender, cm);
    if (chargedDamage >= defender.hp / 1.4 && fastDPT > 1.5) useShield = true;
    if (chargedDamage >= defender.hp - cycleDamage) useShield = true;
  }

  if (isSelfAttackDebuffing(move) && dmg / defender.hp > 0.55) useShield = true;

  return useShield;
}

interface PlanState {
  energy: number;
  oppHp: number;
  oppShields: number;
  atkStage: number;
  turns: number;
  firstMove: MoveData | null;
  firstWait: number;
}

/**
 * 找出最快打倒對手的出招順序，回傳「現在該不該丟、丟哪一招」。
 * 這是 pvpoke ActionLogic 那套 DP 搜尋的簡化版：窮舉「下一發丟哪個大招」，
 * 把等能量期間的快招傷害一併算進去，取總回合數最少的路徑。
 */
function planFastestKO(self: Side, opp: Side): { move: MoveData; throwNow: boolean } | null {
  const fm = self.loadout.fastMove;
  const moves = self.loadout.chargedMoves;
  if (!moves.length || fm.energyGain <= 0) return null;

  const baseFastDmg = damage(self, opp, fm);
  let bestTurns = baseFastDmg > 0 ? Math.ceil(opp.hp / baseFastDmg) * fm.turns : Infinity;
  let best: { move: MoveData; firstWait: number } | null = null;

  const queue: PlanState[] = [
    { energy: self.energy, oppHp: opp.hp, oppShields: opp.shields, atkStage: self.atkStage, turns: 0, firstMove: null, firstWait: 0 },
  ];
  let states = 0;

  while (queue.length && states < 400) {
    const st = queue.shift()!;
    states++;

    for (const m of moves) {
      const need = Math.max(0, m.energy - st.energy);
      const fastNeeded = Math.ceil(need / fm.energyGain);
      const fastDmg = damage(self, opp, fm, st.atkStage);
      const waitTurns = fastNeeded * fm.turns;

      const hpAfterFast = st.oppHp - fastNeeded * fastDmg;
      if (hpAfterFast <= 0) {
        const killFast = Math.ceil(st.oppHp / fastDmg);
        const total = st.turns + killFast * fm.turns;
        if (total < bestTurns) { bestTurns = total; best = { move: m, firstWait: 1 }; }
        continue;
      }

      // 自傷招要囤到能量上限才丟
      if (isSelfAttackDebuffing(m) && st.firstMove === null) {
        const reachable = Math.min(100, self.energy + Math.floor((100 - self.energy) / fm.energyGain) * fm.energyGain);
        if (self.energy < reachable && self.energy >= m.energy) continue;
      }

      const chargedDmg = damage(self, opp, m, st.atkStage);
      const shielded = st.oppShields > 0;
      const dealt = shielded ? 1 : chargedDmg;
      const newOppHp = hpAfterFast - dealt;
      const newTurns = st.turns + waitTurns + 2;
      const firstMove = st.firstMove ?? m;
      const firstWait = st.firstMove === null ? fastNeeded : st.firstWait;

      if (newOppHp <= 0) {
        if (newTurns < bestTurns) { bestTurns = newTurns; best = { move: firstMove, firstWait }; }
        continue;
      }
      if (newTurns >= bestTurns || st.turns > 60) continue;

      const selfBuff = m.buffs && (m.buffTarget ?? 'self') === 'self' && (m.buffChance ?? 1) >= 1 ? m.buffs[0] : 0;
      queue.push({
        energy: Math.min(100, st.energy + fastNeeded * fm.energyGain - m.energy),
        oppHp: newOppHp,
        oppShields: shielded ? st.oppShields - 1 : st.oppShields,
        atkStage: Math.max(-4, Math.min(4, st.atkStage + selfBuff)),
        turns: newTurns,
        firstMove,
        firstWait,
      });
    }
  }

  if (!best) return null;
  return { move: best.move, throwNow: best.firstWait === 0 && self.energy >= best.move.energy };
}

/**
 * 決定這回合要不要丟大招、丟哪一招。
 * 順序完全照 pvpoke ActionLogic.decideAction：
 *   能量不夠 → 快死了就丟最痛的 → 對手有盾就誘餌 → 能秒就秒 → 其餘交給 DP。
 * @returns 要丟的大招，或 null（繼續用快招蓄能）
 */
function chooseCharged(self: Side, opp: Side): MoveData | null {
  const byCost = [...self.loadout.chargedMoves].sort((a, b) => a.energy - b.energy);
  if (!byCost.length) return null;
  const cheapest = byCost[0];
  if (self.energy < cheapest.energy) return null;

  if (self.loadout.strategy === 'energy') return cheapest;

  const affordable = byCost.filter((m) => self.energy >= m.energy);
  const winsCMP = self.base.atk >= opp.base.atk;

  // 1. 活不到下一次出手就把最痛的一招丟出去
  const ttl = turnsToLive(self, opp);
  if (ttl < self.loadout.fastMove.turns || (ttl === self.loadout.fastMove.turns && !winsCMP)) {
    return [...affordable].sort((a, b) => damage(self, opp, b) - damage(self, opp, a))[0];
  }

  // 2. 誘餌：對手有盾，而且最便宜那招會被擋，就先丟它換掉一片盾
  if (opp.shields > 0 && !isSelfAttackDebuffing(cheapest) && wouldShield(self, opp, cheapest)) {
    return cheapest;
  }

  // 3. 能一發帶走就一定丟
  if (opp.shields === 0) {
    const lethal = affordable.find((m) => damage(self, opp, m) >= opp.hp);
    if (lethal) return lethal;
  }

  // 4. 能量快滿了就別再囤，溢出的能量等於白打
  if (self.energy >= 100 - self.loadout.fastMove.energyGain) {
    return [...affordable].sort((a, b) => damage(self, opp, b) / b.energy - damage(self, opp, a) / a.energy)[0];
  }

  // 5. 其餘交給 DP
  const plan = planFastestKO(self, opp);
  return plan?.throwNow ? plan.move : null;
}

/**
 * 套用招式的能力變化。
 * buffs = [攻擊階, 防禦階]，兩者都套在 buffTarget 指定的那一方
 * （self = 自己、opponent = 對手；both 只有 Obstruct 一招，照 pvpoke 當成對手處理）。
 * @returns 給介面顯示的說明文字
 */
function applyBuffs(move: MoveData, attacker: Side, defender: Side): string | undefined {
  if (!move.buffs) return undefined;
  // demo 採確定性：機率未滿 1 的能力變化不觸發，同一組設定才跑得出同一個結果
  if ((move.buffChance ?? 1) < 1) return undefined;

  const [atkChange, defChange] = move.buffs;
  const target = move.buffTarget ?? 'self';
  const who = target === 'self' ? attacker : defender;
  const label = target === 'self' ? '自身' : '對手';
  const parts: string[] = [];

  if (atkChange) { who.atkStage += atkChange; parts.push(`${label}攻擊 ${atkChange > 0 ? '+' : ''}${atkChange}`); }
  if (defChange) { who.defStage += defChange; parts.push(`${label}防禦 ${defChange > 0 ? '+' : ''}${defChange}`); }

  for (const side of [attacker, defender]) {
    side.atkStage = Math.max(-4, Math.min(4, side.atkStage));
    side.defStage = Math.max(-4, Math.min(4, side.defStage));
  }
  return parts.length ? parts.join('、') : undefined;
}

/**
 * 跑完一場 1v1 模擬。
 * @param la A 方設定
 * @param lb B 方設定
 */
export function simulate(la: Loadout, lb: Loadout): BattleResult {
  const a = makeSide('a', la);
  const b = makeSide('b', lb);
  const sides: Side[] = [a, b];
  const turns: TurnRecord[] = [];

  // 開場先算好給介面用的分析資料
  const analysis: BattleResult['analysis'] = {
    firstChargedTurn: { a: firstCharged(a, b), b: firstCharged(b, a) },
    cmpWinner: a.base.atk > b.base.atk ? 'a' : b.base.atk > a.base.atk ? 'b' : 'tie',
    cmpAtk: { a: a.base.atk, b: b.base.atk },
    fastDamage: { a: damage(a, b, a.loadout.fastMove), b: damage(b, a, b.loadout.fastMove) },
    hpLeft: { a: a.maxHp, b: b.maxHp },
    rating: { a: 0, b: 0 },
  };

  let turn = 1;
  let endTurn = 0;

  while (turn <= MAX_TURNS) {
    const events: BattleEvent[] = [];
    const chargedWindow = sides.some((s) => s.pendingCharged?.resolveTurn === turn);

    // ── 階段 A：決策（規則 4／5，大招結算回合雙方都不能開新動作）──
    if (!chargedWindow) {
      for (const s of sides) {
        const opp = s === a ? b : a;
        if (s.hp <= 0 || opp.hp <= 0) continue;
        if (s.pendingFast || s.pendingCharged) continue;

        const ch = chooseCharged(s, opp);
        if (ch) {
          s.energy -= ch.energy;
          s.pendingCharged = { move: ch, triggerTurn: turn, resolveTurn: turn + 1 };
          events.push({ kind: 'trigger', side: s.key, move: zhName(ch), moveType: ch.type, energyCost: ch.energy });
        } else {
          const fm = s.loadout.fastMove;
          s.pendingFast = { move: fm, startTurn: turn, resolveTurn: turn + fm.turns - 1 };
        }
      }
    }

    // ── 階段 B：大招結算（規則 5：先於快招；CMP 決定同回合誰先）──
    const chargedNow = sides.filter((s) => s.pendingCharged?.resolveTurn === turn);
    if (chargedNow.length === 2) {
      chargedNow.sort((x, y) => y.base.atk - x.base.atk); // CMP：攻擊高的先
    }
    for (const s of chargedNow) {
      const opp = s === a ? b : a;
      const pc = s.pendingCharged!;
      s.pendingCharged = null;
      // 規則：同回合被快招打倒，大招照樣生效。但被大招打倒就不生效。
      if (s.hp <= 0 && s.faintSource === 'charged') continue;

      const raw = damage(s, opp, pc.move);
      const shielded = wouldShield(s, opp, pc.move);
      const dealt = shielded ? 1 : raw;
      if (shielded) opp.shields -= 1;
      opp.hp -= dealt;
      s.damageDealt += dealt;
      s.chargedCount += 1;
      const buffText = applyBuffs(pc.move, s, opp);
      events.push({
        kind: 'charged',
        side: s.key,
        move: zhName(pc.move),
        moveType: pc.move.type,
        damage: dealt,
        shielded,
        energyCost: pc.move.energy,
        buffText,
        cmpWin: chargedNow.length === 2 && chargedNow[0] === s ? true : undefined,
      });
      if (opp.hp <= 0 && !opp.faintSource) opp.faintSource = 'charged';
    }

    // ── 階段 C：快招結算（規則 1：同回合同時結算，先算完再一起套用）──
    const fastNow = sides.filter(
      (s) => s.pendingFast?.resolveTurn === turn && !(s.hp <= 0 && s.faintSource === 'charged')
    );
    const resolved = fastNow.map((s) => {
      const opp = s === a ? b : a;
      return { s, opp, dmg: damage(s, opp, s.pendingFast!.move), move: s.pendingFast!.move, startTurn: s.pendingFast!.startTurn };
    });
    for (const r of resolved) {
      r.s.pendingFast = null;
      if (r.opp.hp <= 0 && r.opp.faintSource === 'charged') continue; // 對手已被大招帶走
      r.opp.hp -= r.dmg;
      r.s.energy = Math.min(100, r.s.energy + r.move.energyGain);
      r.s.damageDealt += r.dmg;
      r.s.fastCount += 1;
      events.push({
        kind: 'fast',
        side: r.s.key,
        move: zhName(r.move),
        moveType: r.move.type,
        damage: r.dmg,
        energyGain: r.move.energyGain,
        startTurn: r.startTurn,
      });
      if (r.opp.hp <= 0 && !r.opp.faintSource) r.opp.faintSource = 'fast';
    }

    for (const s of sides) {
      if (s.hp <= 0 && !events.some((e) => e.kind === 'faint' && e.side === s.key)) {
        events.push({ kind: 'faint', side: s.key });
      }
    }

    turns.push({
      turn,
      seconds: (turn * TURN_MS) / 1000,
      events,
      a: snap(a, turn),
      b: snap(b, turn),
      chargedWindow,
    });

    // 還有沒結算的大招就繼續跑（規則：快招打倒的那一方，大招仍會發動）
    const pendingLeft = sides.some((s) => s.pendingCharged);
    if ((a.hp <= 0 || b.hp <= 0) && !pendingLeft) {
      endTurn = turn;
      break;
    }
    turn++;
  }

  if (!endTurn) endTurn = turns.length;

  analysis.hpLeft = { a: Math.max(0, a.hp), b: Math.max(0, b.hp) };
  // 公式同 pvpoke Pokemon.getBattleRating
  analysis.rating = {
    a: Math.floor(500 * ((b.maxHp - Math.max(0, b.hp)) / b.maxHp) + 500 * (Math.max(0, a.hp) / a.maxHp)),
    b: Math.floor(500 * ((a.maxHp - Math.max(0, a.hp)) / a.maxHp) + 500 * (Math.max(0, b.hp) / b.maxHp)),
  };

  const winner: SideKey | 'draw' =
    a.hp <= 0 && b.hp <= 0 ? 'draw' : a.hp <= 0 ? 'b' : b.hp <= 0 ? 'a' : analysis.rating.a > analysis.rating.b ? 'a' : analysis.rating.b > analysis.rating.a ? 'b' : 'draw';

  return { turns, winner, endTurn, analysis };
}

/**
 * 純能量計算：最快第幾回合能丟出第一發大招。
 * 公式 = ceil(能量需求 ÷ 每招能量) × 快招回合數，再 +1 是因為大招下一回合才發動（規則 4）。
 */
function firstCharged(s: Side, opp: Side): { turn: number; move: string; fastNeeded: number } | null {
  const cheapest = [...s.loadout.chargedMoves].sort((x, y) => x.energy - y.energy)[0];
  if (!cheapest) return null;
  const fm = s.loadout.fastMove;
  const fastNeeded = Math.ceil(cheapest.energy / fm.energyGain);
  // 第 N 次快招在第 N×turns 回合結算，下一回合才按得下去
  return { turn: fastNeeded * fm.turns + 1, move: zhName(cheapest), fastNeeded };
}
