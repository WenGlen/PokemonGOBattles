import { buildRadarContext, buildTagContext, radarValues, type RadarContext, type TagContext } from './analysis';
import type { AppData } from './app-data';
import { battleStats, suggestedBuild, type LeagueCp } from './stats';
import type { PokemonData } from './types';

/**
 * 一隻寶可夢在某個聯盟的實戰值。
 *
 * 三圍不是種族值，是照 pvpoke 建議的等級與 IV 算出來的實戰值，
 * 所以換聯盟整批數字都會變——寶可夢表與屬性表都吃同一份，避免兩邊算法走鐘。
 */
export interface MonRow {
  p: PokemonData;
  /** 這個聯盟的排名，沒上榜是 null */
  rank: number | null;
  score: number | null;
  cp: number;
  level: number;
  atk: number;
  def: number;
  hp: number;
  /** 耐久 = 防禦 × HP，和 pvpoke 的 stat product 同一個概念 */
  bulk: number;
  moveset: string[] | null;
}

/**
 * 全部寶可夢在某個聯盟的實戰值。
 * @param data 載好的四份資料
 * @param cp 聯盟 CP 上限
 */
export function buildRows(data: AppData, cp: LeagueCp): MonRow[] {
  const rowsFor = data.rowsFor(cp);
  const rankOf = new Map(rowsFor.map((r, i) => [r.id, { rank: i + 1, score: r.score, moveset: r.moveset }]));
  return data.gm.pokemon.map((p) => {
    const r = rankOf.get(p.id);
    const build = suggestedBuild(p, cp);
    const st = battleStats(p.stats, build.ivs, build.level, Boolean(p.shadow));
    return {
      p,
      rank: r?.rank ?? null,
      score: r?.score ?? null,
      cp: st.cp,
      level: build.level,
      atk: st.atk,
      def: st.def,
      hp: st.hp,
      bulk: st.def * st.hp,
      moveset: r?.moveset ?? null,
    };
  });
}

/**
 * 標籤門檻與雷達圖百分位的母體。
 *
 * 用整個聯盟上榜的那一批（不是全部 1619 隻），因為「肉盾」要比的對象是
 * 實戰真的會遇到的人；換聯盟就要整個重算。
 *
 * @param rows buildRows 的輸出
 */
export function buildContexts(rows: MonRow[], data: AppData, cp: LeagueCp): { tagCtx: TagContext; radarCtx: RadarContext } {
  const ranked = new Set(data.rowsFor(cp).map((r) => r.id));
  const pool = rows.filter((r) => ranked.has(r.p.id)).map((r) => radarValues(r.p, r, data.moveById));
  return { tagCtx: buildTagContext(pool), radarCtx: buildRadarContext(pool) };
}
