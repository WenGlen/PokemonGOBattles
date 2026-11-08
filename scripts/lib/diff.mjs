/**
 * 兩份正規化資料之間的差異，以及「這次變動影響到誰」。
 *
 * 招式平衡調整是輸球的隱形原因：一招威力 +10，整個聯盟的對位就換一輪，
 * 但官方不會發公告。這支的工作就是把那種變動撈出來、講白話。
 */

/** 招式裡只要其中一個值變了，對戰結果就會變的欄位 */
const MOVE_FIELDS = [
  { key: 'type', label: '屬性' },
  { key: 'power', label: '威力' },
  { key: 'energy', label: '能量需求' },
  { key: 'energyGain', label: '能量獲得' },
  { key: 'turns', label: '回合數' },
  { key: 'buffs', label: '能力變化' },
  { key: 'buffTarget', label: '變化對象' },
  { key: 'buffChance', label: '觸發機率' },
];

/** 排名前幾名才算「主流」；影響分析只看這個範圍，免得整頁都是冷門寶可夢 */
const META_RANK = 100;
/** 排名變動要動這麼多名才值得報 */
const RANK_MOVE_MIN = 10;
/** 進出榜只看前這幾名 */
const RANK_WATCH = 50;
/** 單一清單最多列幾筆，其餘只留數量 */
const LIST_CAP = 40;

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * 清單過長時截斷，另外記下被截掉幾筆。
 * @template T
 * @param {T[]} list
 * @returns {{items: T[], more: number}}
 */
function cap(list) {
  return { items: list.slice(0, LIST_CAP), more: Math.max(0, list.length - LIST_CAP) };
}

/**
 * 建一張「招式 id → 會這招的主流寶可夢」對照表。
 * @param {{pokemon: object[]}} bundle
 * @param {Record<string, {id: string, score: number}[]>} rankings
 * @returns {Map<string, {id: string, zh: string, league: string, rank: number}[]>}
 */
function metaUsersByMove(bundle, rankings) {
  /** @type {Map<string, {league: string, rank: number}>} 每隻取它最好的名次 */
  const best = new Map();
  for (const [cp, list] of Object.entries(rankings ?? {})) {
    list.slice(0, META_RANK).forEach((r, i) => {
      const prev = best.get(r.id);
      if (!prev || i + 1 < prev.rank) best.set(r.id, { league: cp, rank: i + 1 });
    });
  }
  const out = new Map();
  for (const p of bundle.pokemon) {
    const rank = best.get(p.id);
    if (!rank) continue;
    for (const mv of [...(p.fast ?? []), ...(p.charged ?? [])]) {
      if (!out.has(mv)) out.set(mv, []);
      out.get(mv).push({ id: p.id, zh: p.zh, league: rank.league, rank: rank.rank });
    }
  }
  for (const list of out.values()) list.sort((a, b) => a.rank - b.rank);
  return out;
}

/**
 * 比對兩份 gamemaster bundle。
 * @param {{pokemon: object[], moves: object[]}} prev
 * @param {{pokemon: object[], moves: object[]}} next
 * @param {Record<string, {id: string, score: number}[]>} [rankings] 用來標註影響範圍
 */
export function diffBundles(prev, next, rankings) {
  const users = metaUsersByMove(next, rankings ?? {});

  // ── 招式 ──────────────────────────────────────────────
  const prevMoves = new Map(prev.moves.map((m) => [m.id, m]));
  const nextMoves = new Map(next.moves.map((m) => [m.id, m]));

  const movesAdded = [];
  const movesChanged = [];
  for (const [id, m] of nextMoves) {
    const old = prevMoves.get(id);
    if (!old) { movesAdded.push(brief(m)); continue; }
    const fields = MOVE_FIELDS
      .filter((f) => !same(old[f.key], m[f.key]))
      .map((f) => ({ key: f.key, label: f.label, from: old[f.key] ?? null, to: m[f.key] ?? null }));
    if (fields.length) {
      movesChanged.push({ ...brief(m), fields, users: (users.get(id) ?? []).slice(0, 8) });
    }
  }
  const movesRemoved = [...prevMoves.keys()].filter((id) => !nextMoves.has(id)).map((id) => brief(prevMoves.get(id)));

  // ── 寶可夢 ────────────────────────────────────────────
  const prevMons = new Map(prev.pokemon.map((p) => [p.id, p]));
  const nextMons = new Map(next.pokemon.map((p) => [p.id, p]));

  const monsAdded = [];
  const statChanged = [];
  const typeChanged = [];
  const movesetChanged = [];
  for (const [id, p] of nextMons) {
    const old = prevMons.get(id);
    if (!old) { monsAdded.push({ id, zh: p.zh, dex: p.dex, types: p.types }); continue; }
    if (!same(old.stats, p.stats)) {
      statChanged.push({ id, zh: p.zh, from: old.stats, to: p.stats });
    }
    if (!same(old.types, p.types)) {
      typeChanged.push({ id, zh: p.zh, from: old.types, to: p.types });
    }
    const gained = [], lost = [];
    for (const kind of ['fast', 'charged']) {
      const before = new Set(old[kind] ?? []);
      const after = new Set(p[kind] ?? []);
      for (const mv of after) if (!before.has(mv)) gained.push(moveLabel(mv, nextMoves));
      for (const mv of before) if (!after.has(mv)) lost.push(moveLabel(mv, prevMoves));
    }
    if (gained.length || lost.length) movesetChanged.push({ id, zh: p.zh, gained, lost });
  }
  const monsRemoved = [...prevMons.keys()]
    .filter((id) => !nextMons.has(id))
    .map((id) => ({ id, zh: prevMons.get(id).zh, dex: prevMons.get(id).dex }));

  return {
    moves: { added: cap(movesAdded), removed: cap(movesRemoved), changed: cap(movesChanged) },
    pokemon: {
      added: cap(monsAdded), removed: cap(monsRemoved),
      stats: cap(statChanged), types: cap(typeChanged), moveset: cap(movesetChanged),
    },
    counts: {
      movesAdded: movesAdded.length, movesRemoved: movesRemoved.length, movesChanged: movesChanged.length,
      pokemonAdded: monsAdded.length, pokemonRemoved: monsRemoved.length,
      statChanged: statChanged.length, typeChanged: typeChanged.length, movesetChanged: movesetChanged.length,
    },
  };
}

/** 招式的精簡描述，日誌裡不需要整筆 */
const brief = (m) => ({ id: m.id, zh: m.zh, type: m.type, power: m.power, energy: m.energy, energyGain: m.energyGain, turns: m.turns });

/** 招式 id → 顯示名；查不到（例如這一版才被刪掉）就退回 id */
const moveLabel = (id, byId) => ({ id, zh: byId.get(id)?.zh ?? id });

/**
 * 比對兩份排名。排名每次重算都會動，所以只報夠大的變化。
 * @param {Record<string, {id: string, score: number}[]>} prev
 * @param {Record<string, {id: string, score: number}[]>} next
 * @param {{pokemon: object[]}} bundle 用來查中文名
 */
export function diffRankings(prev, next, bundle) {
  const zhById = new Map(bundle.pokemon.map((p) => [p.id, p.zh]));
  const out = {};
  let total = 0;
  for (const cp of Object.keys(next ?? {})) {
    const before = new Map((prev?.[cp] ?? []).map((r, i) => [r.id, { rank: i + 1, score: r.score }]));
    const after = (next[cp] ?? []).map((r, i) => ({ ...r, rank: i + 1 }));

    const entered = [], left = [], moved = [];
    for (const r of after) {
      const old = before.get(r.id);
      const zh = zhById.get(r.id) ?? r.id;
      if (!old) { if (r.rank <= RANK_WATCH) entered.push({ id: r.id, zh, rank: r.rank, score: r.score }); continue; }
      const delta = old.rank - r.rank;
      const watched = r.rank <= RANK_WATCH || old.rank <= RANK_WATCH;
      if (watched && Math.abs(delta) >= RANK_MOVE_MIN) {
        moved.push({ id: r.id, zh, from: old.rank, to: r.rank, delta, score: r.score, scoreFrom: old.score });
      }
    }
    const nowIds = new Set(after.map((r) => r.id));
    for (const [id, old] of before) {
      if (!nowIds.has(id) && old.rank <= RANK_WATCH) left.push({ id, zh: zhById.get(id) ?? id, rank: old.rank });
    }
    moved.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    total += entered.length + left.length + moved.length;
    out[cp] = { entered: cap(entered), left: cap(left), moved: cap(moved) };
  }
  return { leagues: out, total };
}

/**
 * 這一筆變動到底值不值得提醒使用者。
 * 排名天天重算，只有排名動不算「有事發生」。
 * @param {ReturnType<typeof diffBundles>} data
 */
export function isNotable(data) {
  const c = data.counts;
  return c.movesAdded + c.movesRemoved + c.movesChanged + c.pokemonAdded + c.statChanged + c.typeChanged + c.movesetChanged > 0;
}

/**
 * 印成人看得懂的幾行，給 CI log 與本機用。
 * @param {object} entry
 * @returns {string[]}
 */
export function describe(entry) {
  const L = [];
  const c = entry.counts;
  L.push(`${entry.date}  資料 ${entry.from ?? '—'} → ${entry.to}`);
  if (entry.message) L.push(`  來源 commit：${entry.message}`);

  if (c.movesChanged) {
    L.push(`  招式調整 ${c.movesChanged} 項`);
    for (const m of entry.moves.changed.items.slice(0, 10)) {
      const f = m.fields.map((x) => `${x.label} ${fmt(x.from)} → ${fmt(x.to)}`).join('、');
      L.push(`    ${arrow(m.fields)} ${m.zh}  ${f}`);
      if (m.users.length) {
        L.push(`        影響主流：${m.users.slice(0, 5).map((u) => `${u.zh}（${u.league} #${u.rank}）`).join('、')}`);
      }
    }
    if (entry.moves.changed.more) L.push(`    …另外 ${entry.moves.changed.more} 項`);
  }
  if (c.movesAdded) L.push(`  新招式 ${c.movesAdded} 個：${entry.moves.added.items.slice(0, 8).map((m) => m.zh).join('、')}`);
  if (c.movesRemoved) L.push(`  移除招式 ${c.movesRemoved} 個：${entry.moves.removed.items.slice(0, 8).map((m) => m.zh).join('、')}`);
  if (c.pokemonAdded) L.push(`  新上線 ${c.pokemonAdded} 隻：${entry.pokemon.added.items.slice(0, 8).map((p) => p.zh).join('、')}`);
  if (c.pokemonRemoved) L.push(`  下架 ${c.pokemonRemoved} 隻：${entry.pokemon.removed.items.slice(0, 8).map((p) => p.zh).join('、')}`);
  if (c.statChanged) {
    L.push(`  三圍調整 ${c.statChanged} 隻`);
    for (const p of entry.pokemon.stats.items.slice(0, 8)) L.push(`    ${p.zh}  ${p.from.join('/')} → ${p.to.join('/')}`);
  }
  if (c.typeChanged) {
    L.push(`  屬性調整 ${c.typeChanged} 隻`);
    for (const p of entry.pokemon.types.items.slice(0, 8)) L.push(`    ${p.zh}  ${p.from.join('·')} → ${p.to.join('·')}`);
  }
  if (c.movesetChanged) {
    L.push(`  招式池變動 ${c.movesetChanged} 隻`);
    for (const p of entry.pokemon.moveset.items.slice(0, 10)) {
      const g = p.gained.length ? `＋${p.gained.map((m) => m.zh).join('、')}` : '';
      const l = p.lost.length ? `－${p.lost.map((m) => m.zh).join('、')}` : '';
      L.push(`    ${p.zh}  ${[g, l].filter(Boolean).join('  ')}`);
    }
    if (entry.pokemon.moveset.more) L.push(`    …另外 ${entry.pokemon.moveset.more} 隻`);
  }
  if (entry.rankings?.total) {
    L.push(`  排名變動 ${entry.rankings.total} 筆（次要訊號，排名每次重算都會動）`);
  }
  if (L.length === 1) L.push('  沒有影響對戰的變動');
  return L;
}

/** 數值往上是強化、往下是削弱；能量需求與回合數相反 */
function arrow(fields) {
  const up = fields.some((f) => (f.key === 'power' || f.key === 'energyGain') && f.to > f.from)
    || fields.some((f) => (f.key === 'energy' || f.key === 'turns') && f.to < f.from);
  const down = fields.some((f) => (f.key === 'power' || f.key === 'energyGain') && f.to < f.from)
    || fields.some((f) => (f.key === 'energy' || f.key === 'turns') && f.to > f.from);
  if (up && !down) return '⬆';
  if (down && !up) return '⬇';
  return '◆';
}

const fmt = (v) => (v === null || v === undefined ? '—' : Array.isArray(v) ? `[${v.join(', ')}]` : String(v));
