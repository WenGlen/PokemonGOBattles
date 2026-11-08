'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import SortHead, { type Sort } from '@/components/SortHead';
import TypePicker from '@/components/TypePicker';
import PokemonDetail from '@/components/PokemonDetail';
import { buildTagContext, fastRates } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import type { Box } from '@/lib/collection';
import { battleStats, suggestedBuild, type LeagueCp } from '@/lib/stats';
import { effBucket, effectiveness } from '@/lib/typeChart';
import { zhName, type PokemonData } from '@/lib/types';

type Key = 'rank' | 'zh' | 'dex' | 'atk' | 'def' | 'hp' | 'bulk';

/** 同時能攤開幾隻來比 */
const MAX_PICKED = 2;

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
 * 數值底下的細長條，拿表上最高的當 100%。
 *
 * 右邊對齊是為了跟右對齊的數字共用同一條邊，掃一眼就比得出長短；
 * 最小留 2% 才不會讓小數值看起來像沒有。
 * 每 20% 換一個顏色（紅→橙→黃→黃綠→綠），長度相近時用顏色補一刀；
 * 顏色是長度的重複編碼，不是唯一資訊，所以色覺差異不影響判讀。
 *
 * @param v 這一列的值
 * @param max 這一欄目前的最大值
 */
function Bar({ v, max }: { v: number; max: number }) {
  const ratio = v / max;
  // [0,20) 是第 1 段…[80,100] 是第 5 段；剛好 100% 會算成第 6 段，夾回來
  const band = Math.min(5, Math.floor(ratio * 5) + 1);
  return (
    <span className="bar" aria-hidden="true">
      <i className={`b${band}`} style={{ width: `${Math.max(2, ratio * 100).toFixed(1)}%` }} />
    </span>
  );
}

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
  const deckRef = useRef<HTMLDivElement>(null);

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

  const rowById = useMemo(() => new Map(rows.map((r) => [r.p.id, r])), [rows]);

  /**
   * 標籤門檻跟同聯盟上榜的那一批比，所以每換一個聯盟就要重算一次。
   * 用整個聯盟當母體（不是全部 1619 隻），因為「肉盾」要比的對象是實戰會遇到的人。
   */
  const tagCtx = useMemo(() => {
    const ranked = new Set(data.rowsFor(cp).map((r) => r.id));
    const pool = rows
      .filter((r) => ranked.has(r.p.id))
      .map((r) => {
        const fasts = r.p.fast.map((id) => data.moveById.get(id)).filter(Boolean);
        const rates = fasts.map((m) => fastRates(m!));
        return {
          atk: r.atk, def: r.def, hp: r.hp,
          ept: Math.max(0, ...rates.map((x) => x.ept)),
          dpt: Math.max(0, ...rates.map((x) => x.dpt)),
        };
      });
    return buildTagContext(pool);
  }, [rows, data, cp]);

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
    def: Math.max(1, ...shown.map((r) => r.def)),
    hp: Math.max(1, ...shown.map((r) => r.hp)),
    bulk: Math.max(1, ...shown.map((r) => r.bulk)),
  }), [shown]);

  const deck = picked.map((id) => rowById.get(id)).filter(Boolean) as Row[];

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

  // 卡片在表格上面，列表捲到一半點新的一隻時卡片可能在畫面外；
  // nearest 只在真的看不到時才捲，已經看得到就不動。
  useEffect(() => {
    if (picked.length) deckRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [picked]);

  return (
    <>
      {deck.length > 0 && (
        <div ref={deckRef} className="pd-deckwrap">
          <div className={`pd-deck${deck.length > 1 ? ' two' : ''}`}>
            {deck.map((r) => (
              <PokemonDetail
                key={r.p.id}
                p={r.p}
                data={data}
                ctx={tagCtx}
                st={{
                  rank: r.rank, score: r.score, cp: r.cp, level: r.level,
                  atk: r.atk, def: r.def, hp: r.hp, bulk: r.bulk, moveset: r.moveset,
                }}
                onClose={() => toggle(r.p.id)}
              />
            ))}
          </div>
          <p className="pd-note">
            「打得痛／打不動」算的是對<b>單屬性</b>對手的結果，實戰遇到雙屬性還要再乘一次；
            完整的相剋關係在對戰組合表裡按整隊看。最多同時放兩隻，再點第三隻會換掉先選的那一隻。
          </p>
        </div>
      )}

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
                <th className="left">屬性</th>
                <SortHead k="atk" sort={sort} setSort={setSort}>攻擊</SortHead>
                <SortHead k="def" sort={sort} setSort={setSort}>防禦</SortHead>
                <SortHead k="hp" sort={sort} setSort={setSort}>HP</SortHead>
                <SortHead k="bulk" sort={sort} setSort={setSort} title="防禦 × HP，越大越耐打">耐久</SortHead>
                <th className="left">推薦招式</th>
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
                    <td className="num">{r.rank ?? '—'}{r.score !== null && <small className="dim"> {r.score}</small>}</td>
                    <td className="left nm">
                      <PokemonIcon key={r.p.icon} icon={r.p.icon} alt="" size={24} shadow={Boolean(r.p.shadow)} />
                      <span>{zhName(r.p)}</span>
                      <small className="dim">#{r.p.dex}</small>
                      {on && <small className="pick">✓</small>}
                    </td>
                    <td className="left">
                      <span className="trow">{r.p.types.map((t) => <TypeIcon key={t} type={t} size={14} />)}</span>
                    </td>
                    <td className="num">{r.atk.toFixed(1)}<Bar v={r.atk} max={max.atk} /></td>
                    <td className="num">{r.def.toFixed(1)}<Bar v={r.def} max={max.def} /></td>
                    <td className="num">{r.hp}<Bar v={r.hp} max={max.hp} /></td>
                    <td className="num">{Math.round(r.bulk).toLocaleString()}<Bar v={r.bulk} max={max.bulk} /></td>
                    <td className="left sm">
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
