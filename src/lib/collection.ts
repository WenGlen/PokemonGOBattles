'use client';

import { useCallback, useEffect, useState } from 'react';
import { calcCP, type LeagueCp } from './stats';
import type { ChangelogEntry, PokemonData } from './types';

/** 你實際擁有的一隻：等級、IV、已解鎖的招式 */
export interface OwnedMon {
  id: string;
  level: number;
  ivs: [number, number, number];
  fast: string;
  charged: [string, string | null];
  /** 加進來的時間，用來維持穩定排序 */
  added: number;
}

const KEY = 'pogo-box-v1';

/** 等級只能是 1 到 51、每 0.5 一階 */
export function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 40;
  return Math.min(51, Math.max(1, Math.round(n * 2) / 2));
}

/** IV 只能是 0 到 15 的整數 */
export function clampIv(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(15, Math.max(0, Math.round(n)));
}

/**
 * 把「15/14/13」這種貼上來的字串讀成 IV。
 * 遊戲裡的檢定結果、各種工具的輸出都長這樣，斜線、空白、逗號都接受。
 *
 * @returns 讀不出三個數字時回 null，由呼叫端決定要不要擋
 */
export function parseIvs(text: string): [number, number, number] | null {
  const nums = text.match(/\d+/g);
  if (!nums || nums.length < 3) return null;
  const [a, d, s] = nums.slice(0, 3).map((x) => clampIv(Number(x)));
  return [a, d, s];
}

/** 這一隻在這個聯盟進不進得去。大師聯盟沒有上限 */
export function fitsLeague(p: PokemonData, o: OwnedMon, cp: LeagueCp): boolean {
  if (cp >= 10000) return true;
  return calcCP(p.stats, o.ivs, o.level) <= cp;
}

/** 存進去之前先確認形狀，壞掉的一筆不要讓整個箱子開不起來 */
function sane(x: unknown): OwnedMon | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Partial<OwnedMon>;
  if (typeof o.id !== 'string' || !o.id) return null;
  if (!Array.isArray(o.ivs) || o.ivs.length !== 3) return null;
  if (typeof o.fast !== 'string') return null;
  const charged = Array.isArray(o.charged) ? o.charged : [];
  return {
    id: o.id,
    level: clampLevel(Number(o.level)),
    ivs: [clampIv(Number(o.ivs[0])), clampIv(Number(o.ivs[1])), clampIv(Number(o.ivs[2]))],
    fast: o.fast,
    charged: [String(charged[0] ?? ''), charged[1] ? String(charged[1]) : null],
    added: Number(o.added) || Date.now(),
  };
}

function read(): OwnedMon[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list.map(sane).filter(Boolean) as OwnedMon[]) : [];
  } catch {
    // 無痕視窗、關掉網站資料、JSON 壞掉——都當成空箱子，不要讓整頁掛掉
    return [];
  }
}

export interface Box {
  list: OwnedMon[];
  /** 已經從 localStorage 讀完了沒。讀完之前不要顯示「箱子是空的」 */
  ready: boolean;
  add: (m: OwnedMon) => void;
  update: (id: string, patch: Partial<OwnedMon>) => void;
  remove: (id: string) => void;
  has: (id: string) => boolean;
}

/**
 * 你的箱子，存在這台裝置的 localStorage。
 *
 * 不上傳任何東西——這是個純靜態網站，沒有後端可以存，
 * 也不該為了這個功能去要一組帳號。代價是換裝置要重建。
 */
export function useBox(): Box {
  const [list, setList] = useState<OwnedMon[]>([]);
  const [ready, setReady] = useState(false);

  // 靜態輸出會先產好 HTML，第一次 render 不能碰 localStorage，
  // 不然伺服器端與瀏覽器端對不上。掛載後才讀。
  useEffect(() => {
    setList(read());
    setReady(true);
  }, []);

  const save = useCallback((next: OwnedMon[]) => {
    setList(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // 存不進去就只有這次工作階段有效，畫面照樣能用
    }
  }, []);

  return {
    list,
    ready,
    add: useCallback((m: OwnedMon) => save([...read().filter((x) => x.id !== m.id), m]), [save]),
    update: useCallback(
      (id: string, patch: Partial<OwnedMon>) =>
        save(read().map((x) => (x.id === id ? { ...x, ...patch } : x))),
      [save]
    ),
    remove: useCallback((id: string) => save(read().filter((x) => x.id !== id)), [save]),
    has: useCallback((id: string) => list.some((x) => x.id === id), [list]),
  };
}

/** 一次變動打到你箱子裡的哪幾隻、為什麼 */
export interface BoxHit {
  zh: string;
  why: string;
}

/**
 * 這一版變動有沒有影響到你的箱子。
 *
 * 「某招被調整」要算到你頭上的條件是**你這隻學得會那一招**，
 * 不是你現在剛好帶著它——帶不帶可以改，學不學得會不能。
 *
 * @param e 一版變動
 * @param owned 你箱子裡那幾隻的完整資料
 */
export function boxHits(e: ChangelogEntry, owned: PokemonData[]): BoxHit[] {
  if (!owned.length) return [];
  const hits = new Map<string, string[]>();
  const note = (p: PokemonData, why: string) => {
    const k = p.zh || p.name;
    if (!hits.has(k)) hits.set(k, []);
    const arr = hits.get(k)!;
    if (!arr.includes(why)) arr.push(why);
  };

  const pool = owned.map((p) => ({ p, moves: new Set([...p.fast, ...p.charged]) }));

  for (const m of e.moves.changed.items) {
    for (const x of pool) if (x.moves.has(m.id)) note(x.p, `${m.zh} 被調整`);
  }
  for (const m of e.moves.removed.items) {
    for (const x of pool) if (x.moves.has(m.id)) note(x.p, `${m.zh} 被移除`);
  }
  const byId = new Map(owned.map((p) => [p.id, p]));
  for (const c of e.pokemon.stats.items) {
    const p = byId.get(c.id);
    if (p) note(p, '三圍被調整');
  }
  for (const c of e.pokemon.types.items) {
    const p = byId.get(c.id);
    if (p) note(p, '屬性被改');
  }
  for (const c of e.pokemon.moveset.items) {
    const p = byId.get(c.id);
    if (!p) continue;
    if (c.gained.length) note(p, `學得到新招：${c.gained.map((x) => x.zh).join('、')}`);
    if (c.lost.length) note(p, `不再學得到：${c.lost.map((x) => x.zh).join('、')}`);
  }

  return [...hits].map(([zh, whys]) => ({ zh, why: whys.join('、') }));
}
