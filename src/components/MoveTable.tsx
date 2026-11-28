'use client';

import { useMemo, useState } from 'react';
import Bar from '@/components/Bar';
import DamageCalc, { MAX_CALC } from '@/components/DamageCalc';
import { TypeIcon } from '@/components/Icon';
import SortHead, { type Sort } from '@/components/SortHead';
import TypePicker from '@/components/TypePicker';
import { dpe, fastRates, isFast } from '@/lib/analysis';
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

/** Dpe 的滿格：3 以上在 PvP 已經是頂規，拿它當三段的上限 */
const DPE_FULL = 3;

/**
 * Dpe 的三段式長條。
 *
 * 一段代表 1.0 的 Dpe，由右往左填：2.5 就是右邊兩段滿、左邊那段畫一半。
 * 整段滿或整段空的只畫一半長度，把寬度讓給唯一在變的那一段——
 * 主流大招的 Dpe 幾乎都落在 2.x，差別全在小數那一段，
 * 平均分三等份的話那一段只占三分之一，根本比不出來。
 *
 * @param v Dpe
 */
function DpeBar({ v }: { v: number }) {
  // 由左到右分別是 [2,3)、[1,2)、[0,1)，所以右邊先填滿
  const segs = [2, 1, 0].map((base) => Math.max(0, Math.min(1, v - base)));
  const band = Math.min(5, Math.floor((Math.min(v, DPE_FULL) / DPE_FULL) * 5) + 1);
  return (
    <span className="dbar" aria-hidden="true">
      {segs.map((f, i) => (
        <span key={i} style={{ flex: f === 0 || f === 1 ? 0.5 : 1 }}>
          <i className={`b${band}`} style={{ width: `${(f * 100).toFixed(1)}%` }} />
        </span>
      ))}
    </span>
  );
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
  /** 丟進上面打擊計算的那幾招，順序就是按下去的順序，滿了擠掉最早的 */
  const [picked, setPicked] = useState<string[]>([]);
  const togglePick = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-MAX_CALC)));

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

  /** 長條的基準：拿目前這張表看得到的那一批比，換快招大招或篩選就跟著重算 */
  const max = useMemo(() => ({
    power: Math.max(1, ...shown.map((r) => r.m.power)),
    energy: Math.max(1, ...shown.map((r) => (kind === 'fast' ? r.m.energyGain : r.m.energy))),
  }), [shown, kind]);

  return (
    <>
      {/* 計算在上面、挑招在下面：挑完往上看結果，不用來回捲 */}
      <DamageCalc data={data} picked={picked} onRemove={(id) => setPicked((p) => p.filter((x) => x !== id))} />

      <div className="tbl-wrap">
      <div className="tbl-bar">
        {([['fast', '快招'], ['charged', '大招']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={kind === k} onClick={() => {
            setKind(k);
            setSort({ key: k === 'fast' ? 'ept' : 'dpe', dir: -1 });
          }}>{label}</button>
        ))}
        <TypePicker value={type} onChange={setType} anyLabel="所有屬性" title="只看這個屬性的招式" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋招式（中文或英文）…" />
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
                  <SortHead k="dpt" sort={sort} setSort={setSort} title="每回合傷害 = 威力 ÷ 回合數">Dpt</SortHead>
                  <SortHead k="ept" sort={sort} setSort={setSort} title="每回合能量 = 能量獲得 ÷ 回合數">Ept</SortHead>
                </>
              ) : (
                <>
                  <SortHead k="energy" sort={sort} setSort={setSort} defaultDir={1}>能量</SortHead>
                  <SortHead k="dpe" sort={sort} setSort={setSort} title="每點能量的傷害 = 威力 ÷ 能量">Dpe</SortHead>
                  <th className="left">能力變化</th>
                </>
              )}
              <SortHead k="users" sort={sort} setSort={setSort} title="有幾隻寶可夢學得會">會的隻數</SortHead>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              // 整列可以點：點一下丟進上面的打擊計算，再點一下拿掉
              <tr
                key={r.m.id}
                className={picked.includes(r.m.id) ? 'on' : undefined}
                aria-selected={picked.includes(r.m.id)}
                title="點一下加進上面的打擊計算（最多三招）"
                style={{ cursor: 'pointer' }}
                onClick={() => togglePick(r.m.id)}
              >
                <td className="left nm">
                  <TypeIcon type={r.m.type} size={14} />
                  <span className="mv-name">{zhName(r.m)}</span>
                </td>
                <td className="num">{r.m.power}<Bar v={r.m.power} max={max.power} /></td>
                {kind === 'fast' ? (
                  <>
                    <td>{r.m.turns}</td>
                    <td className="num">+{r.m.energyGain}<Bar v={r.m.energyGain} max={max.energy} /></td>
                    <td className="num">{r.dpt.toFixed(2)}</td>
                    <td className="num">{r.ept.toFixed(2)}</td>
                  </>
                ) : (
                  <>
                    {/* 大招的能量是成本，越便宜越好，所以顏色反過來 */}
                    <td className="num">{r.m.energy}<Bar v={r.m.energy} max={max.energy} invert /></td>
                    <td className="num">{r.dpe.toFixed(2)}<DpeBar v={r.dpe} /></td>
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
    </>
  );
}
