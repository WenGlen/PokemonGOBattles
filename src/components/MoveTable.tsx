'use client';

import { useMemo, useState } from 'react';
import { TypeIcon } from '@/components/Icon';
import SortHead, { type Sort } from '@/components/SortHead';
import { ALL_TYPES, dpe, fastRates, isFast } from '@/lib/analysis';
import type { AppData } from '@/lib/app-data';
import { TYPE_ZH } from '@/lib/typeChart';
import { zhName, type MoveData } from '@/lib/types';

type Key = 'zh' | 'type' | 'power' | 'energy' | 'turns' | 'dpt' | 'ept' | 'dpe' | 'users';

/** 一列要顯示的全部數值，先算好再排序 */
interface Row {
  m: MoveData;
  dpt: number;
  ept: number;
  dpe: number;
  users: number;
}

/** 能力變化寫成人看得懂的字 */
function buffText(m: MoveData): string | null {
  if (!m.buffs) return null;
  const who = m.buffTarget === 'self' ? '自身' : '對手';
  const parts = [
    m.buffs[0] ? `攻擊 ${m.buffs[0] > 0 ? '+' : ''}${m.buffs[0]}` : '',
    m.buffs[1] ? `防禦 ${m.buffs[1] > 0 ? '+' : ''}${m.buffs[1]}` : '',
  ].filter(Boolean);
  if (!parts.length) return null;
  const chance = m.buffChance && m.buffChance < 1 ? `（${Math.round(m.buffChance * 100)}%）` : '';
  return `${who} ${parts.join('、')}${chance}`;
}

/**
 * 招式表。
 *
 * 快招與大招看的是不同數字，所以分開顯示欄位：
 * 快招看 DPT（每回合傷害）與 EPT（每回合能量），大招看 DPE（每點能量的傷害）。
 * 這三個是 PvP 判斷一招好不好的標準指標。
 */
export default function MoveTable({ data }: { data: AppData }) {
  const [kind, setKind] = useState<'fast' | 'charged'>('charged');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<Sort<Key>>({ key: 'dpe', dir: -1 });

  /** 每個招式有幾隻寶可夢學得會 */
  const userCount = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of data.gm.pokemon) {
      for (const id of [...p.fast, ...p.charged]) n.set(id, (n.get(id) ?? 0) + 1);
    }
    return n;
  }, [data]);

  const rows = useMemo<Row[]>(() => {
    const want = kind === 'fast';
    return data.gm.moves
      .filter((m) => isFast(m) === want)
      .map((m) => {
        const r = fastRates(m);
        return { m, dpt: r.dpt, ept: r.ept, dpe: dpe(m), users: userCount.get(m.id) ?? 0 };
      });
  }, [data, kind, userCount]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) =>
      (!type || r.m.type === type) &&
      (!needle || zhName(r.m).includes(needle) || r.m.name.toLowerCase().includes(needle))
    );
    const get = (r: Row): string | number => {
      switch (sort.key) {
        case 'zh': return zhName(r.m);
        case 'type': return TYPE_ZH[r.m.type] ?? r.m.type;
        case 'power': return r.m.power;
        case 'energy': return kind === 'fast' ? r.m.energyGain : r.m.energy;
        case 'turns': return r.m.turns;
        default: return r[sort.key];
      }
    };
    return filtered.sort((a, b) => {
      const x = get(a), y = get(b);
      const c = typeof x === 'string' ? String(x).localeCompare(String(y), 'zh-Hant') : (x as number) - (y as number);
      return c * sort.dir;
    });
  }, [rows, q, type, sort, kind]);

  return (
    <div className="tbl-wrap">
      <div className="tbl-bar">
        {([['charged', '大招'], ['fast', '快招']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={kind === k} onClick={() => {
            setKind(k);
            setSort({ key: k === 'fast' ? 'ept' : 'dpe', dir: -1 });
          }}>{label}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋招式（中文或英文）…" />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">所有屬性</option>
          {ALL_TYPES.map((t) => <option key={t} value={t}>{TYPE_ZH[t]}</option>)}
        </select>
        <span className="hint">{shown.length} 招</span>
      </div>

      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <SortHead k="zh" sort={sort} setSort={setSort} defaultDir={1} align="left">招式</SortHead>
              <SortHead k="power" sort={sort} setSort={setSort}>威力</SortHead>
              {kind === 'fast' ? (
                <>
                  <SortHead k="turns" sort={sort} setSort={setSort} defaultDir={1}>回合</SortHead>
                  <SortHead k="energy" sort={sort} setSort={setSort}>能量</SortHead>
                  <SortHead k="dpt" sort={sort} setSort={setSort} title="每回合傷害 = 威力 ÷ 回合數">DPT</SortHead>
                  <SortHead k="ept" sort={sort} setSort={setSort} title="每回合能量 = 能量獲得 ÷ 回合數">EPT</SortHead>
                </>
              ) : (
                <>
                  <SortHead k="energy" sort={sort} setSort={setSort} defaultDir={1}>能量</SortHead>
                  <SortHead k="dpe" sort={sort} setSort={setSort} title="每點能量的傷害 = 威力 ÷ 能量">DPE</SortHead>
                  <th className="left">能力變化</th>
                </>
              )}
              <SortHead k="users" sort={sort} setSort={setSort} title="有幾隻寶可夢學得會">會的隻數</SortHead>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.m.id}>
                <td className="left nm">
                  <TypeIcon type={r.m.type} size={14} />
                  <span>{zhName(r.m)}</span>
                </td>
                <td>{r.m.power}</td>
                {kind === 'fast' ? (
                  <>
                    <td>{r.m.turns}</td>
                    <td>+{r.m.energyGain}</td>
                    <td className="num">{r.dpt.toFixed(2)}</td>
                    <td className="num">{r.ept.toFixed(2)}</td>
                  </>
                ) : (
                  <>
                    <td>{r.m.energy}</td>
                    <td className="num">{r.dpe.toFixed(2)}</td>
                    <td className="left sm">{buffText(r.m) ?? '—'}</td>
                  </>
                )}
                <td>{r.users}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="tbl-empty">找不到符合的招式</div>}
      </div>
    </div>
  );
}
