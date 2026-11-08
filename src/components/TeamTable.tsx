'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import SidePanel from '@/components/SidePanel';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import {
  ALL_TYPES, effLabel, encounterByType, moveExposure, scanThreats, teamTypePressure,
  type MoveExposure, type Threat,
} from '@/lib/analysis';
import type { AppData, SideConfig } from '@/lib/app-data';
import type { LeagueCp } from '@/lib/stats';
import { TYPE_ZH } from '@/lib/typeChart';
import { zhName, type Loadout, type PokemonData } from '@/lib/types';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** 倍率對應的格子樣式：被剋紅、抵抗綠 */
function cellClass(mult: number): string {
  if (mult > 1.6) return 'bad2';
  if (mult > 1) return 'bad';
  if (mult < 0.7) return 'good2';
  if (mult < 1) return 'good';
  return '';
}

/** 屬性弱點盤點 */
function TypeGrid({ team, rows }: { team: PokemonData[]; rows: ReturnType<typeof teamTypePressure> }) {
  // 先看會痛的，同樣痛的再看遇得到的機率
  const sorted = [...rows].sort((a, b) => b.weak - a.weak || b.encounter - a.encounter);
  return (
    <div className="tbl-scroll">
      <table className="tbl grid">
        <thead>
          <tr>
            <th className="left">對手屬性</th>
            {team.map((p) => (
              <th key={p.id} className="num">
                <PokemonIcon key={p.icon} icon={p.icon} alt={zhName(p)} size={22} shadow={Boolean(p.shadow)} />
              </th>
            ))}
            <th className="num" title="主流裡這個屬性的招式有多常見">遇到率</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.type} className={r.weak >= 2 ? 'hot' : ''}>
              <td className="left nm"><TypeIcon type={r.type} size={15} label /></td>
              {r.each.map((m, i) => (
                <td key={i} className={`num ${cellClass(m)}`} title={effLabel(m)}>×{m.toFixed(2)}</td>
              ))}
              <td className="num dim">{r.encounter > 0 ? pct(r.encounter) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 對手可能帶的招式 */
function ExposureList({ list }: { list: MoveExposure[] }) {
  const [all, setAll] = useState(false);
  const [by, setBy] = useState<'threat' | 'rate'>('threat');

  // 照威脅排：先看剋你幾隻，同樣的再看遇到率。
  // 只照遇到率排的話，最常見但打不痛你的招會塞滿前面，看不到重點。
  const sorted = useMemo(
    () => [...list].sort((a, b) => (by === 'threat' ? b.hits - a.hits || b.rate - a.rate : b.rate - a.rate)),
    [list, by]
  );
  const shown = all ? sorted : sorted.slice(0, 15);

  return (
    <>
      <div className="tbl-bar">
        {([['threat', '照威脅排'], ['rate', '照遇到率排']] as const).map(([k, label]) => (
          <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{label}</button>
        ))}
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th className="left">招式</th>
              <th className="num" title="主流對手之中，預期有多少比例會帶這一招">遇到率</th>
              <th className="num" title="前 N 名主流裡有幾隻會帶">帶的隻數</th>
              <th className="num" title="這一招打在你隊上，幾隻被剋">剋你幾隻</th>
              <th className="left">誰會帶</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.move.id} className={e.hits >= 2 ? 'hot' : ''}>
                <td className="left nm">
                  <TypeIcon type={e.move.type} size={14} />
                  <span>{zhName(e.move)}</span>
                  <small className="dim">
                    {e.move.energyGain > 0
                      ? `${e.move.power}力 ${e.move.turns}回合 ⚡+${e.move.energyGain}`
                      : `${e.move.power}力 ⚡${e.move.energy}`}
                  </small>
                </td>
                <td className="num">{pct(e.rate)}</td>
                <td className="num dim">{e.users.length}</td>
                <td className={`num ${e.hits >= 2 ? 'bad2' : e.hits === 1 ? 'bad' : ''}`}>{e.hits || '—'}</td>
                <td className="left sm">
                  {e.users.slice(0, 4).map((u) => (
                    <span key={u.id} className="mv">
                      <PokemonIcon key={u.icon} icon={u.icon} alt="" size={16} />
                      {u.zh}<small className="dim">{u.pct}%</small>
                    </span>
                  ))}
                  {e.users.length > 4 && <small className="dim">…另外 {e.users.length - 4} 隻</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 15 && (
        <button className="more-btn" onClick={() => setAll((v) => !v)}>
          {all ? '只看前 15 招' : `看全部 ${sorted.length} 招`}
        </button>
      )}
    </>
  );
}

/** 打得贏整隊的主流對手 */
function ThreatList({ threats, team }: { threats: Threat[]; team: PokemonData[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = threats.filter((t) => t.beats > 0).slice(0, 25);
  if (!shown.length) return <div className="tbl-empty">這個範圍內沒有主流對手能贏你隊上任何一隻</div>;
  return (
    <div className="tbl-scroll">
      <table className="tbl">
        <thead>
          <tr>
            <th className="num">排名</th>
            <th className="left">對手</th>
            <th className="num" title="你隊上有幾隻打不贏牠">贏你幾隻</th>
            {team.map((p) => (
              <th key={p.id} className="num">
                <PokemonIcon key={p.icon} icon={p.icon} alt={zhName(p)} size={22} shadow={Boolean(p.shadow)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <Fragment key={t.id}>
              <tr
                className={t.beats === 3 ? 'hot' : ''}
                onClick={() => setOpen(open === t.id ? null : t.id)}
                style={{ cursor: 'pointer' }}
              >
                <td className="num dim">{t.rank}</td>
                <td className="left nm">
                  <PokemonIcon key={t.icon} icon={t.icon} alt="" size={24} shadow={t.shadow} />
                  <span>{t.zh}</span>
                  <small className="dim">{open === t.id ? '▾' : '▸'}</small>
                </td>
                <td className={`num ${t.beats === 3 ? 'bad2' : t.beats === 2 ? 'bad' : ''}`}>{t.beats}／3</td>
                {t.vs.map((v, i) => (
                  <td key={i} className={`num ${v.win ? 'good' : 'bad'}`} title={`對位評分 ${v.rating}／1000`}>
                    {v.win ? '贏' : '輸'}<small className="dim"> {v.rating}</small>
                  </td>
                ))}
              </tr>
              {open === t.id && (
                <tr className="detail">
                  <td />
                  <td className="left sm" colSpan={2 + team.length}>
                    牠帶的招：
                    {t.moves.map((m) => (
                      <span key={m.id} className="mv">
                        <TypeIcon type={m.type} size={12} />
                        {zhName(m)}
                        <small className="dim">
                          {m.energyGain > 0 ? `${m.power}力 ${m.turns}回合` : `${m.power}力 ⚡${m.energy}`}
                        </small>
                      </span>
                    ))}
                    <span className="dim">· 評分低於 500 代表你那一隻打不贏</span>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 對戰組合表。
 *
 * 放三隻進去，回答兩件事：對手可能帶什麼招、你被什麼剋。
 * 屬性那塊是精確的相剋計算；招式遇到率來自 pvpoke 統計的實際使用率；
 * 威脅名單是用自己的模擬器現場跑出來的，所以會照你實際選的招式與護盾。
 */
export default function TeamTable({ data, cp }: { data: AppData; cp: LeagueCp }) {
  const [team, setTeam] = useState<SideConfig[]>([]);
  const [metaN, setMetaN] = useState(50);
  const [foeShields, setFoeShields] = useState(1);

  const list = data.listFor(cp);

  // 預設放這個聯盟的前三名；換聯盟時重算推薦招式但保留選的是誰
  useEffect(() => {
    if (list.length < 3) return;
    setTeam((prev) => {
      const ids = prev.length === 3 ? prev.map((c) => c.id) : [list[0].id, list[1].id, list[2].id];
      return ids.map((id, i) => ({ ...data.defaultsFor(id, cp), shields: prev[i]?.shields ?? 1 }));
    });
  }, [data, cp, list]);

  const mons = useMemo(
    () => team.map((c) => data.monById.get(c.id)).filter(Boolean) as PokemonData[],
    [team, data]
  );

  const loadouts = useMemo(
    () => team.map((c) => data.toLoadout(c, cp, 'optimal')).filter(Boolean) as Loadout[],
    [team, data, cp]
  );

  /** 主流對手：照排名取前 N，用牠們的推薦招式 */
  const foes = useMemo(() => {
    const out: { loadout: Loadout; rank: number }[] = [];
    data.rowsFor(cp).slice(0, metaN).forEach((r, i) => {
      const cfg = { ...data.defaultsFor(r.id, cp), shields: foeShields };
      const l = data.toLoadout(cfg, cp, 'optimal');
      if (l) out.push({ loadout: l, rank: i + 1 });
    });
    return out;
  }, [data, cp, metaN, foeShields]);

  const exposure = useMemo(
    () => (mons.length ? moveExposure(data.rowsFor(cp), data.monById, data.moveById, mons, metaN) : []),
    [data, cp, mons, metaN]
  );

  const pressure = useMemo(
    () => teamTypePressure(mons, encounterByType(exposure)),
    [mons, exposure]
  );

  const threats = useMemo(
    () => (loadouts.length === 3 ? scanThreats(loadouts, foes) : []),
    [loadouts, foes]
  );

  if (team.length < 3) return null;

  const worst = threats.filter((t) => t.beats === 3).length;
  const bad = threats.filter((t) => t.beats === 2).length;

  return (
    <>
      <div className="sides three">
        {team.map((c, i) => (
          <SidePanel
            key={i}
            title={`第 ${i + 1} 隻`}
            compact
            cfg={c}
            data={data}
            cp={cp}
            set={(next) => setTeam((t) => t.map((x, j) => (j === i ? next : x)))}
          />
        ))}
      </div>

      <div className="leagues sub">
        <span className="hint">主流範圍</span>
        {[30, 50, 100].map((n) => (
          <button key={n} aria-pressed={metaN === n} onClick={() => setMetaN(n)}>前 {n} 名</button>
        ))}
        <span className="hint" style={{ marginLeft: 10 }}>對手護盾</span>
        {[0, 1, 2].map((n) => (
          <button key={n} aria-pressed={foeShields === n} onClick={() => setFoeShields(n)}>{n}</button>
        ))}
      </div>

      <div className="verdict">
        <span className={`big ${worst ? 'lose' : bad ? '' : 'win'}`}>
          {worst ? `${worst} 隻打穿你整隊` : bad ? `${bad} 隻贏你兩隻` : '沒有通殺你的對手'}
        </span>
        <span className="sub">
          掃過前 {metaN} 名主流 · 你最怕的屬性是 {
            [...pressure].sort((a, b) => b.weak * 10 + b.encounter - (a.weak * 10 + a.encounter))[0]?.type
              ? TYPE_ZH[[...pressure].sort((a, b) => b.weak * 10 + b.encounter - (a.weak * 10 + a.encounter))[0].type]
              : '—'
          }
        </span>
      </div>

      <section className="blk">
        <h3>被哪些屬性剋制</h3>
        <p className="blk-note">
          數字是你挨那個屬性攻擊時的傷害倍率，紅色代表被剋。
          「遇到率」是主流對手之中有多少比例帶著該屬性的招式——<b>又被剋、又常遇到的那幾列才是真問題</b>。
        </p>
        <TypeGrid team={mons} rows={pressure} />
      </section>

      <section className="blk">
        <h3>對手可能帶哪些招</h3>
        <p className="blk-note">
          來自 pvpoke 統計的實際使用率，不是「牠學得會什麼」——學得會但沒人帶的招列出來只會洗版。
        </p>
        <ExposureList list={exposure} />
      </section>

      <section className="blk">
        <h3>最怕這幾隻</h3>
        <p className="blk-note">
          用模擬器拿前 {metaN} 名主流逐一對過你這三隻，照你實際選的招式與護盾。
          點一列可以展開。出招決策是簡化版演算法，所以這份當「優先注意」用，不是判決。
        </p>
        <ThreatList threats={threats} team={mons} />
      </section>
    </>
  );
}
