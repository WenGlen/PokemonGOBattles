'use client';

import { useMemo, useState } from 'react';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import SortHead, { type Sort } from '@/components/SortHead';
import { ALL_TYPES } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import { battleStats, suggestedBuild, type LeagueCp } from '@/lib/stats';
import { TYPE_ZH } from '@/lib/typeChart';
import { zhName, type PokemonData } from '@/lib/types';

type Key = 'rank' | 'zh' | 'dex' | 'cp' | 'atk' | 'def' | 'hp' | 'bulk';

interface Row {
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
 * 寶可夢表。
 *
 * 三圍是「在這個聯盟的實戰值」——照 pvpoke 建議的等級與 IV 算出來的，
 * 不是種族值，所以換聯盟整張表的數字都會變。
 */
export default function PokemonTable({ data, cp }: { data: AppData; cp: LeagueCp }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [onlyRanked, setOnlyRanked] = useState(true);
  const [sort, setSort] = useState<Sort<Key>>({ key: 'rank', dir: 1 });

  const rows = useMemo<Row[]>(() => {
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
  }, [data, cp]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) =>
      (!onlyRanked || r.rank !== null) &&
      (!type || r.p.types.includes(type)) &&
      (!needle || zhName(r.p).includes(needle) || r.p.name.toLowerCase().includes(needle) || String(r.p.dex) === needle)
    );
    return filtered.sort((a, b) => {
      let c: number;
      if (sort.key === 'zh') c = zhName(a.p).localeCompare(zhName(b.p), 'zh-Hant');
      else if (sort.key === 'dex') c = a.p.dex - b.p.dex;
      else if (sort.key === 'rank') {
        // 沒上榜的一律排最後，不管升冪降冪
        if (a.rank === null && b.rank === null) c = a.p.dex - b.p.dex;
        else if (a.rank === null) return 1;
        else if (b.rank === null) return -1;
        else c = a.rank - b.rank;
      } else c = (a[sort.key] as number) - (b[sort.key] as number);
      return c * sort.dir;
    });
  }, [rows, q, type, onlyRanked, sort]);

  return (
    <div className="tbl-wrap">
      <div className="tbl-bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋寶可夢（中文、英文或圖鑑編號）…" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">所有屬性</option>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_ZH[t]}</option>)}
        </select>
        <button aria-pressed={onlyRanked} onClick={() => setOnlyRanked((v) => !v)}>只看上榜的</button>
        <span className="hint">{shown.length} 隻</span>
      </div>

      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <SortHead k="rank" sort={sort} setSort={setSort} defaultDir={1} title="pvpoke 在這個聯盟的總排名">排名</SortHead>
              <SortHead k="zh" sort={sort} setSort={setSort} defaultDir={1} align="left">寶可夢</SortHead>
              <th className="left">屬性</th>
              <SortHead k="cp" sort={sort} setSort={setSort}>CP</SortHead>
              <SortHead k="atk" sort={sort} setSort={setSort}>攻擊</SortHead>
              <SortHead k="def" sort={sort} setSort={setSort}>防禦</SortHead>
              <SortHead k="hp" sort={sort} setSort={setSort}>HP</SortHead>
              <SortHead k="bulk" sort={sort} setSort={setSort} title="防禦 × HP，越大越耐打">耐久</SortHead>
              <th className="left">推薦招式</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 400).map((r) => (
              <tr key={r.p.id}>
                <td className="num">{r.rank ?? '—'}{r.score !== null && <small className="dim"> {r.score}</small>}</td>
                <td className="left nm">
                  <PokemonIcon key={r.p.icon} icon={r.p.icon} alt="" size={24} shadow={Boolean(r.p.shadow)} />
                  <span>{zhName(r.p)}</span>
                  <small className="dim">#{r.p.dex}</small>
                </td>
                <td className="left">
                  <span className="trow">{r.p.types.map((t) => <TypeIcon key={t} type={t} size={14} />)}</span>
                </td>
                <td className="num">{r.cp}<small className="dim"> Lv{r.level}</small></td>
                <td className="num">{r.atk.toFixed(1)}</td>
                <td className="num">{r.def.toFixed(1)}</td>
                <td className="num">{r.hp}</td>
                <td className="num">{Math.round(r.bulk).toLocaleString()}</td>
                <td className="left sm">
                  {r.moveset
                    ? r.moveset.map((id) => {
                        const m = data.moveById.get(id);
                        return m ? <span key={id} className="mv"><TypeIcon type={m.type} size={12} />{zhName(m)}</span> : null;
                      })
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="tbl-empty">找不到符合的寶可夢</div>}
        {shown.length > 400 && <div className="tbl-empty">只顯示前 400 筆，用搜尋或篩選縮小範圍</div>}
      </div>
    </div>
  );
}
