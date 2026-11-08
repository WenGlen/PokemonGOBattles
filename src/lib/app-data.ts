'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RankRow } from './analysis';
import { suggestedBuild, type LeagueCp } from './stats';
import type { Changelog, GameMaster, Loadout, MoveData, PokemonData } from './types';

export interface Meta {
  gamemasterTimestamp: string;
  source: { repo: string; license: string };
  counts: { pokemon: number; moves: number };
  checks: { name: string; ok: boolean; detail: string }[];
}

/** 一隻寶可夢的使用者設定：選了什麼招、帶幾個盾 */
export interface SideConfig {
  id: string;
  fast: string;
  charged: [string, string | null];
  shields: number;
}

export interface AppData {
  gm: GameMaster;
  meta: Meta;
  ranks: Record<string, RankRow[]>;
  log: Changelog | null;
  monById: Map<string, PokemonData>;
  moveById: Map<string, MoveData>;
  /** 某個聯盟的排名列 */
  rowsFor: (cp: LeagueCp) => RankRow[];
  /** 某個聯盟的候選清單，照排名排序，沒上榜的排後面 */
  listFor: (cp: LeagueCp) => PokemonData[];
  /** 用 pvpoke 推薦的招式組當預設 */
  defaultsFor: (id: string, cp: LeagueCp) => SideConfig;
  /**
   * 設定轉成模擬器吃的 Loadout，資料不全時回 null。
   * @param build 指定等級與 IV；不給就用 pvpoke 在這個聯盟的建議個體。
   *   箱子裡的那幾隻要用你自己的數值，所以要帶這個。
   */
  toLoadout: (
    cfg: SideConfig,
    cp: LeagueCp,
    strategy: 'optimal' | 'energy',
    build?: { level: number; ivs: [number, number, number] }
  ) => Loadout | null;
}

/**
 * 載入四份資料並備好查表。
 *
 * 四個分頁共用同一份，所以只抓一次；
 * 變動日誌是附加資訊，抓不到也不該讓整頁掛掉。
 */
export function useAppData(): AppData | null {
  const [gm, setGm] = useState<GameMaster | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ranks, setRanks] = useState<Record<string, RankRow[]>>({});
  const [log, setLog] = useState<Changelog | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('data/gamemaster.json').then((r) => r.json()),
      fetch('data/rankings.json').then((r) => r.json()),
      fetch('data/meta.json').then((r) => r.json()),
      fetch('data/changelog.json').then((r) => r.json()).catch(() => ({ entries: [] })),
    ]).then(([g, rk, m, cl]) => {
      setGm(g);
      setRanks(rk);
      setMeta(m);
      setLog(cl);
    });
  }, []);

  const monById = useMemo(() => new Map((gm?.pokemon ?? []).map((p) => [p.id, p])), [gm]);
  const moveById = useMemo(() => new Map((gm?.moves ?? []).map((m) => [m.id, m])), [gm]);

  /** 每個聯盟的排序只算一次 */
  const listCache = useMemo(() => new Map<number, PokemonData[]>(), [gm, ranks]);

  return useMemo(() => {
    if (!gm || !meta) return null;

    const rowsFor = (cp: LeagueCp) => ranks[String(cp)] ?? [];

    const listFor = (cp: LeagueCp) => {
      const hit = listCache.get(cp);
      if (hit) return hit;
      const order = new Map(rowsFor(cp).map((r, i) => [r.id, i]));
      const sorted = [...gm.pokemon].sort(
        (x, y) => (order.get(x.id) ?? 9999) - (order.get(y.id) ?? 9999) || x.dex - y.dex
      );
      listCache.set(cp, sorted);
      return sorted;
    };

    const defaultsFor = (id: string, cp: LeagueCp): SideConfig => {
      const p = monById.get(id)!;
      const rec = rowsFor(cp).find((r) => r.id === id)?.moveset;
      const fast = rec?.[0] && p.fast.includes(rec[0]) ? rec[0] : p.fast[0];
      const c1 = rec?.[1] && p.charged.includes(rec[1]) ? rec[1] : p.charged[0];
      const c2 = rec?.[2] && p.charged.includes(rec[2]) ? rec[2] : p.charged.find((m) => m !== c1) ?? null;
      return { id, fast, charged: [c1, c2], shields: 1 };
    };

    const toLoadout = (
      cfg: SideConfig,
      cp: LeagueCp,
      strategy: 'optimal' | 'energy',
      build?: { level: number; ivs: [number, number, number] }
    ): Loadout | null => {
      const p = monById.get(cfg.id);
      const fm = moveById.get(cfg.fast);
      if (!p || !fm) return null;
      const cms = cfg.charged.map((id) => (id ? moveById.get(id) : null)).filter(Boolean) as MoveData[];
      if (!cms.length) return null;
      const b = build ?? suggestedBuild(p, cp);
      return {
        pokemon: p, fastMove: fm, chargedMoves: cms,
        level: b.level, ivs: b.ivs, shields: cfg.shields,
        shadow: Boolean(p.shadow), strategy,
      };
    };

    return { gm, meta, ranks, log, monById, moveById, rowsFor, listFor, defaultsFor, toLoadout };
  }, [gm, meta, ranks, log, monById, moveById, listCache]);
}
