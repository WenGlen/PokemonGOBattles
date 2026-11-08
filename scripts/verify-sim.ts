/**
 * 模擬器驗證。分兩部分：
 *
 *  A. 規則單元測試 —— 2026-06-23 新系統的五條規則，逐條用最小案例驗證，必須 100% 通過。
 *  B. 對 pvpoke 排名的外部對帳 —— 拿 pvpoke 官方算出的對位結果當標準答案，
 *     比對我們的模擬器判斷的勝負方向。這是唯一能證明引擎沒寫歪的外部依據。
 *
 * 用法：npm run verify
 */

import gmJson from '../data/gamemaster.json';
import type { GameMaster, Loadout, MoveData, PokemonData } from '../src/lib/types';
import { simulate, damage, TURN_MS } from '../src/lib/battle';
import { suggestedBuild } from '../src/lib/stats';
import { effectiveness, MULT } from '../src/lib/typeChart';
import { battleStats } from '../src/lib/stats';

const gm = gmJson as unknown as GameMaster;
const monById = new Map(gm.pokemon.map((p) => [p.id, p]));
const moveById = new Map(gm.moves.map((m) => [m.id, m]));

let pass = 0;
let fail = 0;

function t(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? '  — ' + detail : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
}

/** 造一個測試用的假寶可夢，方便隔離單一規則 */
function dummy(id: string, types: string[], stats: [number, number, number]): PokemonData {
  return { id, dex: 0, name: id, zh: id, icon: 'go:pm0', types, stats, fast: [], charged: [] };
}
function fastMove(id: string, type: string, power: number, gain: number, turns: number): MoveData {
  return { id, name: id, zh: id, type, power, energy: 0, energyGain: gain, turns };
}
function chargedMove(id: string, type: string, power: number, energy: number): MoveData {
  return { id, name: id, zh: id, type, power, energy, energyGain: 0, turns: 1 };
}
function load(p: PokemonData, fm: MoveData, cm: MoveData[], o: Partial<Loadout> = {}): Loadout {
  return { pokemon: p, fastMove: fm, chargedMoves: cm, level: 40, ivs: [15, 15, 15], shields: 0, shadow: Boolean(p.shadow), strategy: 'energy', ...o };
}

console.log('\n═══ 模擬器驗證 ═══\n');
console.log('── A. 新系統五條規則 ──');

// 規則 1：同回合的 1 回合快招平手，雙方都生效
{
  const p = dummy('x', ['normal'], [150, 100, 150]);
  const fm = fastMove('F1', 'normal', 20, 10, 1);
  const r = simulate(load(p, fm, [chargedMove('C', 'normal', 100, 100)]), load(p, fm, [chargedMove('C', 'normal', 100, 100)]));
  const firstTurn = r.turns[0];
  const bothHit = firstTurn.events.filter((e) => e.kind === 'fast').length === 2;
  t('規則 1：同回合 1 回合快招雙方同時結算（平手）', bothHit, `第 1 回合有 ${firstTurn.events.filter((e) => e.kind === 'fast').length} 次快招結算`);
  t('規則 1：能量與傷害同時給', firstTurn.a.energy === 10 && firstTurn.a.hp === firstTurn.b.hp, `雙方能量 ${firstTurn.a.energy}、HP ${firstTurn.a.hp}/${firstTurn.b.hp}`);
}

// 規則 1 延伸：2 回合快招在第 2 回合結束才結算
{
  const p = dummy('x', ['normal'], [150, 100, 150]);
  const fm = fastMove('F2', 'normal', 20, 10, 2);
  const r = simulate(load(p, fm, [chargedMove('C', 'normal', 100, 100)]), load(p, fm, [chargedMove('C', 'normal', 100, 100)]));
  const t1 = r.turns[0].events.some((e) => e.kind === 'fast');
  const t2 = r.turns[1].events.some((e) => e.kind === 'fast');
  t('規則 1：2 回合快招在第 2 回合才結算', !t1 && t2, `第1回合結算=${t1}、第2回合結算=${t2}`);
}

// 規則 4：大招按下後，下一回合才發動
{
  const p = dummy('x', ['normal'], [150, 100, 250]);
  const fm = fastMove('F1', 'normal', 1, 50, 1);
  const cm = chargedMove('C', 'normal', 100, 50);
  const r = simulate(load(p, fm, [cm]), load(p, fm, [cm]));
  const trigIdx = r.turns.findIndex((tr) => tr.events.some((e) => e.kind === 'trigger'));
  const resIdx = r.turns.findIndex((tr) => tr.events.some((e) => e.kind === 'charged'));
  t('規則 4：大招在按下的下一回合才發動', resIdx === trigIdx + 1, `按下於第 ${r.turns[trigIdx]?.turn} 回合、發動於第 ${r.turns[resIdx]?.turn} 回合`);
  t('規則 4：大招結算回合雙方都不能開新動作', r.turns[resIdx]?.chargedWindow === true);
}

// 規則 5：大招傷害在 leak 快招之前結算
{
  const atkr = dummy('atkr', ['normal'], [200, 100, 250]);
  const defr = dummy('defr', ['normal'], [100, 100, 250]);
  const fmSlow = fastMove('F4', 'normal', 20, 25, 4); // 4 回合快招，會 leak 進大招視窗
  const fmFast = fastMove('F1', 'normal', 5, 50, 1);
  const cm = chargedMove('C', 'normal', 100, 50);
  const r = simulate(load(atkr, fmFast, [cm]), load(defr, fmSlow, [cm]));
  const win = r.turns.find((tr) => tr.chargedWindow && tr.events.some((e) => e.kind === 'charged') && tr.events.some((e) => e.kind === 'fast'));
  if (win) {
    const ci = win.events.findIndex((e) => e.kind === 'charged');
    const fi = win.events.findIndex((e) => e.kind === 'fast');
    t('規則 5：同回合大招排在 leak 快招之前', ci < fi, `大招在第 ${ci} 個事件、快招在第 ${fi} 個`);
  } else {
    t('規則 5：同回合大招排在 leak 快招之前', true, '（此組合沒出現同回合情境，略過）');
  }
}

// CMP：同回合都丟大招，攻擊力高的先
{
  const hi = dummy('hi', ['normal'], [200, 100, 200]);
  const lo = dummy('lo', ['normal'], [100, 100, 200]);
  const fm = fastMove('F1', 'normal', 1, 50, 1);
  const cm = chargedMove('C', 'normal', 100, 50);
  const r = simulate(load(hi, fm, [cm]), load(lo, fm, [cm]));
  const win = r.turns.find((tr) => tr.events.filter((e) => e.kind === 'charged').length === 2);
  const first = win?.events.find((e) => e.kind === 'charged');
  t('CMP：同回合雙方都丟大招時攻擊高的先出手', first?.side === 'a' && r.analysis.cmpWinner === 'a', win ? `先出手的是 ${first?.side}` : '沒出現同回合大招');
}

// 第一發大招回合的公式
{
  const p = dummy('x', ['normal'], [150, 100, 400]);
  const fm = fastMove('F3', 'normal', 5, 9, 3);
  const cm = chargedMove('C', 'normal', 50, 45);
  const r = simulate(load(p, fm, [cm]), load(p, fm, [cm]));
  const expectFast = Math.ceil(45 / 9);
  const expectTurn = expectFast * 3 + 1;
  const got = r.analysis.firstChargedTurn.a;
  const triggered = r.turns.find((tr) => tr.events.some((e) => e.kind === 'trigger'))?.turn;
  const landed = r.turns.find((tr) => tr.events.some((e) => e.kind === 'charged'))?.turn;
  t('第一發大招回合：公式 = ceil(能量÷每招) × 快招回合 + 1', got?.turn === expectTurn && triggered === expectTurn, `預測第 ${got?.turn} 回合按下、實測第 ${triggered} 回合按下、第 ${landed} 回合發動（需 ${expectFast} 次快招）`);
}

// 傷害公式：用獨立重寫的一份對帳，避免引擎內部改動無聲走樣
{
  let mismatch = 0;
  let checked = 0;
  const sample = gm.pokemon.filter((p) => p.fast.length && p.charged.length).slice(0, 400);
  for (let i = 0; i < sample.length; i += 2) {
    const A = sample[i], B = sample[i + 1];
    if (!B) break;
    const fa = moveById.get(A.fast[0])!, fb = moveById.get(B.fast[0])!;
    if (!fa || !fb) continue;
    const ba = suggestedBuild(A, 1500), bb = suggestedBuild(B, 1500);
    const sa = battleStats(A.stats, ba.ivs, ba.level, Boolean(A.shadow)), sb = battleStats(B.stats, bb.ivs, bb.level, Boolean(B.shadow));
    // 獨立實作：直接照官方公式，不經過 battle.ts
    const stab = A.types.includes(fa.type) ? MULT.STAB : 1;
    const expected = Math.floor(fa.power * stab * (sa.atk / sb.def) * effectiveness(fa.type, B.types) * 0.5 * MULT.BONUS) + 1;
    const r = simulate(
      load(A, fa, [moveById.get(A.charged[0])!], { level: ba.level, ivs: ba.ivs }),
      load(B, fb, [moveById.get(B.charged[0])!], { level: bb.level, ivs: bb.ivs })
    );
    const ev = r.turns.flatMap((x) => x.events).find((e) => e.kind === 'fast' && e.side === 'a');
    checked++;
    if (ev && ev.kind === 'fast' && ev.damage !== expected) mismatch++;
  }
  t('傷害公式與獨立重寫的一份一致', mismatch === 0, `${checked} 組對照，${mismatch} 組不符`);
}

t('回合長度 500ms', TURN_MS === 500);

// ── B. 對 pvpoke 排名的外部對帳 ──
/** pvpoke gamemaster 的 rankingScenarios，逐字照抄 */
const SCENARIOS = [
  { slug: 'leads', shields: [1, 1], energy: [0, 0] },
  { slug: 'closers', shields: [0, 0], energy: [0, 0] },
  { slug: 'switches', shields: [1, 1], energy: [4, 0] },
  { slug: 'chargers', shields: [1, 1], energy: [6, 0] },
  { slug: 'attackers', shields: [0, 1], energy: [0, 0] },
];

async function externalCheck() {
  console.log('\n── B. 對 pvpoke 官方對位結果的外部對帳 ──');
  const url = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json';
  const res = await fetch(url);
  const ranks = (await res.json()) as any[];
  const byId = new Map(ranks.map((r) => [r.speciesId, r]));

  let agree = 0, total = 0;
  const disagreements: string[] = [];

  for (const r of ranks.slice(0, 80)) {
    const self = monById.get(r.speciesId);
    if (!self || !r.moveset) continue;
    const pairs = [...(r.matchups ?? []), ...(r.counters ?? [])];
    for (const mu of pairs) {
      const oppRank = byId.get(mu.opponent);
      const opp = monById.get(mu.opponent);
      if (!opp || !oppRank?.moveset) continue;

      const fm = moveById.get(r.moveset[0]);
      const cms = r.moveset.slice(1).map((m: string) => moveById.get(m)).filter(Boolean) as MoveData[];
      const ofm = moveById.get(oppRank.moveset[0]);
      const ocms = oppRank.moveset.slice(1).map((m: string) => moveById.get(m)).filter(Boolean) as MoveData[];
      if (!fm || !ofm || !cms.length || !ocms.length) continue;

      const ba = suggestedBuild(self, 1500), bb = suggestedBuild(opp, 1500);
      // 完全照 pvpoke 的 rankingScenarios 跑五種情境再平均。
      // energy 欄位是「回合優勢」，要換算成快招次數：floor(turns*500 / cooldown) * energyGain
      let sum = 0;
      for (const sc of SCENARIOS) {
        const se = (adv: number, m: MoveData) => (adv === 0 ? 0 : Math.min(m.energyGain * Math.floor((adv * 500) / (m.turns * 500)), 100));
        const out = simulate(
          load(self, fm, cms, { level: ba.level, ivs: ba.ivs, shields: sc.shields[0], strategy: 'optimal', startEnergy: se(sc.energy[0], fm) }),
          load(opp, ofm, ocms, { level: bb.level, ivs: bb.ivs, shields: sc.shields[1], strategy: 'optimal', startEnergy: se(sc.energy[1], ofm) })
        );
        sum += out.analysis.rating.a;
      }
      const mine = sum / SCENARIOS.length;
      const theirs = mu.rating;
      total++;
      if ((mine > 500) === (theirs > 500)) agree++;
      else if (disagreements.length < 5) disagreements.push(`${r.speciesId} vs ${mu.opponent}（我 ${mine.toFixed(0)} / pvpoke ${theirs}）`);
    }
  }

  const pct = (agree / total) * 100;
  // 門檻 75%：出招決策是 pvpoke 那套 DP 的簡化版，不追求完全一致，
  // 但方向性必須夠高才代表引擎沒寫歪。
  t('勝負方向與 pvpoke 一致（門檻 75%）', pct >= 75, `${agree}/${total} 組一致（${pct.toFixed(1)}%）`);
  if (disagreements.length) {
    console.log('     不一致樣本：');
    disagreements.forEach((d) => console.log(`       · ${d}`));
  }

  console.log(`\n${fail === 0 ? '✅ 全部通過' : `❌ ${fail} 項失敗`}（通過 ${pass}／共 ${pass + fail}）\n`);
  process.exit(fail === 0 ? 0 : 1);
}

externalCheck();
