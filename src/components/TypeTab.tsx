'use client';

import { useMemo, useState } from 'react';
import Bar from '@/components/Bar';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import MonDeck, { MAX_PICKED } from '@/components/MonDeck';
import SortHead, { type Sort } from '@/components/SortHead';
import TypePicker from '@/components/TypePicker';
import { ALL_TYPES } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import type { Box } from '@/lib/collection';
import { buildContexts, buildRows } from '@/lib/rows';
import { suggestedBuild, type LeagueCp } from '@/lib/stats';
import { effBucket, effClass, effectiveness, TYPE_ZH } from '@/lib/typeChart';
import { zhName } from '@/lib/types';

type Key = 'rank' | 'zh' | 'dex' | 'atk' | 'bulk';

/**
 * 五個桶，從最痛排到最安全。
 *
 * 不照圖鑑順序排十八格——這一頁要回答的是「這組合怕什麼、擋什麼」，
 * 分欄本身就是答案，掃第一欄就知道會被什麼打爆。
 * 底色沿用解析卡那一套 .tm-cell，兩邊看起來才是同一個系統。
 */
const BUCKETS = [
  { b: 2, label: '雙重被剋', mult: '×2.56' },
  { b: 1, label: '被剋', mult: '×1.60' },
  { b: 0, label: '普通', mult: '×1.00' },
  { b: -1, label: '抵抗', mult: '×0.63' },
  // 雙重抵抗是唯一倍率會變的一桶：抵抗兩次 ×0.39、原作免疫再抵抗 ×0.24、免疫兩次 ×0.15。
  // 常態的 ×0.39 跟其他四欄一樣寫在欄標題上（mult 由下面即時算），
  // 只有真的跑出 ×0.24、×0.15 那幾格才把數字留在格子裡。
  { b: -2, label: '雙重抵抗', mult: null },
] as const;

/**
 * 屬性表。
 *
 * 選一到兩種屬性，上面出這個組合挨十八種屬性的倍率（照抵抗程度分欄），
 * 下面列出帶這個組合的寶可夢。
 *
 * 倍率一律走 effectiveness + effBucket，不自己拿數字跟 1 比大小——
 * Niantic 的常數帶著浮點尾數，直接比會把中性算成被剋（見 typeChart.ts）。
 */
export default function TypeTab({ data, cp, box }: { data: AppData; cp: LeagueCp; box: Box }) {
  const [t1, setT1] = useState('');
  const [t2, setT2] = useState('');
  /** 開＝屬性組合完全一樣；關＝帶有其中任一屬性 */
  const [exact, setExact] = useState(true);
  const [onlyRanked, setOnlyRanked] = useState(true);
  const [sort, setSort] = useState<Sort<Key>>({ key: 'rank', dir: 1 });
  const [picked, setPicked] = useState<string[]>([]);

  /** 同一個屬性選兩次等於單屬性，去重之後後面都不用再管這件事 */
  const types = useMemo(() => [...new Set([t1, t2].filter(Boolean))], [t1, t2]);

  const rows = useMemo(() => buildRows(data, cp), [data, cp]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.p.id, r])), [rows]);
  const { tagCtx, radarCtx } = useMemo(() => buildContexts(rows, data, cp), [rows, data, cp]);

  /** 每一桶裝了哪些攻擊屬性。沒選屬性時十八格都是 ×1.00，全落在「普通」 */
  const buckets = useMemo(
    () =>
      BUCKETS.map((bk) => {
        const hits = ALL_TYPES.map((t) => ({ t, mult: effectiveness(t, types) }))
          .filter((x) => effBucket(x.mult) === bk.b);
        // 雙重抵抗欄：有常態的 ×0.39 就寫在標題上，那些格子跟著不用寫數字；
        // 整欄都是 ×0.24 之類的特例時標題留白，由每一格自己報數
        const base = bk.b === -2 ? hits.find((h) => effClass(h.mult) === 'r2')?.mult ?? null : null;
        return { ...bk, hits, mult: bk.mult ?? (base === null ? null : `×${base.toFixed(2)}`), base };
      }),
    [types]
  );

  const shown = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (onlyRanked && r.rank === null) return false;
      if (!types.length) return true;
      return exact
        ? r.p.types.length === types.length && types.every((t) => r.p.types.includes(t))
        : types.some((t) => r.p.types.includes(t));
    });
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
  }, [rows, types, exact, onlyRanked, sort]);

  /** 長條圖的基準：拿目前這張表看得到的那一批比 */
  const max = useMemo(() => ({
    atk: Math.max(1, ...shown.map((r) => r.atk)),
    bulk: Math.max(1, ...shown.map((r) => r.bulk)),
  }), [shown]);

  const deck = picked.map((id) => rowById.get(id)).filter((r) => r !== undefined);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-MAX_PICKED)));

  return (
    <>
      <section className="tg-wrap">
        <div className="tg-bar">
          {/* 選到什麼選單上就看得到，旁邊不用再重複一次 */}
          <TypePicker value={t1} onChange={setT1} anyLabel="第一屬性" big title="要看的屬性組合" />
          <TypePicker value={t2} onChange={setT2} anyLabel="第二屬性" big title="可以不選，只有一種屬性就留空" />
        </div>

        {/* 還沒選屬性時十八格都是 ×1.00，那是一整片沒有資訊的格子，不如不畫。
            GO 沒有免疫，原作的免疫在這裡一律折成 ×0.39，所以只有五桶 */}
        {types.length > 0 && (
          <div className="tg-grid">
            {buckets.map((bk) => (
              <div key={bk.b} data-b={bk.b} className={`tg-col${bk.hits.length ? '' : ' empty'}`}>
                <h4>
                  {bk.label}
                  {bk.mult && <em>{bk.mult}</em>}
                  <span>{bk.hits.length}</span>
                </h4>
                <div className="tg-cells">
                  {bk.hits.map(({ t, mult }) => (
                    <div key={t} className={`tm-cell ef-${effClass(mult)}`} title={`挨 ${TYPE_ZH[t]} ×${mult.toFixed(3)}`}>
                      {/* 雙重的那兩欄圖示再大一圈，掃過去會先停在這裡 */}
                      <TypeIcon type={t} size={Math.abs(bk.b) >= 2 ? 28 : 20} />
                      <span className="tm-name">{TYPE_ZH[t]}</span>
                      {/* 跟欄標題寫的不一樣才需要自己報數 */}
                      {bk.base !== null && mult !== bk.base && <b>×{mult.toFixed(2)}</b>}
                      {bk.base === null && bk.b === -2 && <b>×{mult.toFixed(2)}</b>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <MonDeck deck={deck} data={data} tagCtx={tagCtx} radarCtx={radarCtx} onClose={toggle} />

      <div className="tbl-wrap">
        <div className="tbl-bar">
          <button
            aria-pressed={exact}
            disabled={!types.length}
            title={types.length ? '開：屬性組合完全一樣；關：帶有其中任一屬性' : '先選屬性'}
            onClick={() => setExact((v) => !v)}
          >
            只看完全相同
          </button>
          <button aria-pressed={onlyRanked} onClick={() => setOnlyRanked((v) => !v)}>只看上榜的</button>
          <span className="hint">{shown.length} 隻</span>
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
          {shown.length === 0 && (
            <div className="tbl-empty">
              {onlyRanked ? '這個聯盟沒有這個組合，關掉「只看上榜的」看全部' : '沒有這個屬性組合的寶可夢'}
            </div>
          )}
          {shown.length > 400 && <div className="tbl-empty">只顯示前 400 筆，用屬性縮小範圍</div>}
        </div>
      </div>
    </>
  );
}
