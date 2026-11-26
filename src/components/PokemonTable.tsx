'use client';

import { useMemo, useState } from 'react';
import Bar from '@/components/Bar';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import MonDeck, { MAX_PICKED } from '@/components/MonDeck';
import SortHead, { type Sort } from '@/components/SortHead';
import TypePicker from '@/components/TypePicker';
import type { AppData } from '@/lib/app-data';
import type { Box } from '@/lib/collection';
import { buildContexts, buildRows, type MonRow } from '@/lib/rows';
import { suggestedBuild, type LeagueCp } from '@/lib/stats';
import { effBucket, effectiveness } from '@/lib/typeChart';
import { zhName } from '@/lib/types';

type Key = 'rank' | 'zh' | 'dex' | 'atk' | 'bulk';

/**
 * 寶可夢表。
 *
 * 三圍是「在這個聯盟的實戰值」——照 pvpoke 建議的等級與 IV 算出來的，
 * 不是種族值，所以換聯盟整張表的數字都會變。
 *
 * 點一列會把那隻攤成一張卡，放在表格上面而不是插在列中間：
 * 卡片不跟著列表捲動，所以可以一邊翻表一邊對照，最多同時放兩隻比較。
 */
export default function PokemonTable({ data, cp, box }: { data: AppData; cp: LeagueCp; box: Box }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [onlyRanked, setOnlyRanked] = useState(true);
  /** 擅長抵抗：只留挨這個屬性的招式會被減傷的那些（×0.63 或 ×0.39） */
  const [resist, setResist] = useState('');
  const [sort, setSort] = useState<Sort<Key>>({ key: 'rank', dir: 1 });
  const [picked, setPicked] = useState<string[]>([]);

  const rows = useMemo(() => buildRows(data, cp), [data, cp]);

  const rowById = useMemo(() => new Map(rows.map((r) => [r.p.id, r])), [rows]);

  const { tagCtx, radarCtx } = useMemo(() => buildContexts(rows, data, cp), [rows, data, cp]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) =>
      (!onlyRanked || r.rank !== null) &&
      (!type || r.p.types.includes(type)) &&
      (!resist || effBucket(effectiveness(resist, r.p.types)) < 0) &&
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
  }, [rows, q, type, resist, onlyRanked, sort]);

  /** 長條圖的基準：拿目前這張表看得到的那一批比，換聯盟或篩選就跟著重算 */
  const max = useMemo(() => ({
    atk: Math.max(1, ...shown.map((r) => r.atk)),
    bulk: Math.max(1, ...shown.map((r) => r.bulk)),
  }), [shown]);

  const deck = picked.map((id) => rowById.get(id)).filter(Boolean) as MonRow[];

  /**
   * 已經選了就取消，還沒選就加進去；滿了就把最早選的那隻擠掉。
   * 擠掉舊的比「請先關掉一張」好，點下去一定有反應。
   */
  const toggle = (id: string) =>
    setPicked((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id].slice(-MAX_PICKED)
    );

  return (
    <>
      <MonDeck deck={deck} data={data} tagCtx={tagCtx} radarCtx={radarCtx} onClose={toggle} />

      <div className="tbl-wrap">
        <div className="tbl-bar">
          <TypePicker value={type} onChange={setType} anyLabel="所有屬性" title="只看這個屬性的寶可夢" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋寶可夢（中文、英文或圖鑑編號）…" />
          <button aria-pressed={onlyRanked} onClick={() => setOnlyRanked((v) => !v)}>只看上榜的</button>
          {/* 挑換上去能擋住對手主力的那一隻用的：只留挨這個屬性會減傷的 */}
          <div className="pick-right">
            <TypePicker
              value={resist}
              onChange={setResist}
              anyLabel="擅長抵抗…"
              label={(zh) => `抵抗 ${zh}`}
              wide
              title="只留挨這個屬性的招式會被減傷的寶可夢"
            />
          </div>
        </div>

        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <SortHead k="rank" sort={sort} setSort={setSort} defaultDir={1} title="pvpoke 在這個聯盟的總排名">排名</SortHead>
                <SortHead k="zh" sort={sort} setSort={setSort} defaultDir={1} align="left">寶可夢</SortHead>
                <th className="tp">屬性</th>
                <SortHead k="atk" sort={sort} setSort={setSort}>攻擊</SortHead>
                {/* 防禦與 HP 不單獨列——在對戰裡它們從來不是分開用的，
                    拆成兩欄只會讓人去比兩個沒辦法單獨解讀的數字。拆開的值在解析卡的耐久軸上 */}
                <SortHead k="bulk" sort={sort} setSort={setSort} title="防禦 × HP，越大越耐打">耐久</SortHead>
                <th className="left mv-col">推薦招式</th>
                <th title="加進我的箱子" />
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((r) => {
                const on = picked.includes(r.p.id);
                return (
                  <tr
                    key={r.p.id}
                    className={on ? 'on' : undefined}
                    aria-selected={on}
                    onClick={() => toggle(r.p.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="num rk">
                      <span className={`rk-n${r.rank !== null && r.rank <= 3 ? ' top' : ''}`}>{r.rank ?? '—'}</span>
                      {r.score !== null && <small className="dim">{r.score.toFixed(1)}</small>}
                    </td>
                    <td className="left nm">
                      <PokemonIcon key={r.p.icon} icon={r.p.icon} alt="" size={48} shadow={Boolean(r.p.shadow)} />
                      <span className="nm-txt">
                        <b>{zhName(r.p)}</b>
                        <small className="dim">#{r.p.dex}</small>
                      </span>
                      {on && <small className="pick">✓</small>}
                    </td>
                    <td className="tp">
                      {/* 單屬性置中，雙屬性左上右下微微疊著——兩個圖示排排站會讀成兩件事，
                          疊起來才像是同一隻的一組屬性 */}
                      <span className={`trow${r.p.types.length > 1 ? ' two' : ''}`}>
                        {r.p.types.map((t) => <TypeIcon key={t} type={t} size={22} />)}
                      </span>
                    </td>
                    <td className="num">{r.atk.toFixed(1)}<Bar v={r.atk} max={max.atk} /></td>
                    <td className="num">{Math.round(r.bulk).toLocaleString()}<Bar v={r.bulk} max={max.bulk} /></td>
                    <td className="left sm mv-col">
                      {r.moveset
                        ? r.moveset.map((id) => {
                            const m = data.moveById.get(id);
                            return m ? <span key={id} className="mv"><TypeIcon type={m.type} size={12} />{zhName(m)}</span> : null;
                          })
                        : '—'}
                    </td>
                    <td className="num">
                      {/* 先用這個聯盟的建議個體加進去，之後到箱子裡改成自己的等級與 IV */}
                      <button
                        className={`bx-btn${box.has(r.p.id) ? ' on' : ''}`}
                        title={box.has(r.p.id) ? '已經在箱子裡，按一下移除' : '加進我的箱子（之後可以改成你自己的等級與 IV）'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (box.has(r.p.id)) { box.remove(r.p.id); return; }
                          const b = suggestedBuild(r.p, cp);
                          const d = data.defaultsFor(r.p.id, cp);
                          box.add({ id: r.p.id, level: b.level, ivs: b.ivs, fast: d.fast, charged: d.charged, added: Date.now() });
                        }}
                      >
                        {box.has(r.p.id) ? '✓' : '＋'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <div className="tbl-empty">找不到符合的寶可夢</div>}
          {shown.length > 400 && <div className="tbl-empty">只顯示前 400 筆，用搜尋或篩選縮小範圍</div>}
        </div>
      </div>
    </>
  );
}
