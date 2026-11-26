'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import SidePanel from '@/components/SidePanel';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import MoveNums from '@/components/MoveNums';
import {
  effLabel, encounterByType, moveExposure, scanThreats, teamTypePressure,
  type MoveExposure, type Threat,
} from '@/lib/analysis';
import type { AppData, SideConfig } from '@/lib/app-data';
import type { LeagueCp } from '@/lib/stats';
import { effClass, TYPE_ZH } from '@/lib/typeChart';
import { zhName, type Loadout, type PokemonData } from '@/lib/types';

/** 放進去的是誰的隊伍。同一份計算，但好壞相反。 */
type Side = 'mine' | 'foe';

const pct = (n: number) => `${Math.round(n * 100)}%`;

/**
 * 兩個模式的用字。
 *
 * 三塊分析的「算法」完全一樣——倍率就是倍率、模擬就是模擬；
 * 差別只在這個倍率對你是好消息還是壞消息。所以只換字與顏色，不重算。
 */
const COPY = {
  mine: {
    toggle: '我方隊伍',
    slot: (i: number) => `我方第 ${i} 隻`,
    gridTitle: '屬性克制',
    gridCol: '對手屬性',
    gridCount: '剋你幾隻',
    moveTitle: '留意招式',
    moveHits: '剋你幾隻',
    moveHitsTip: '這一招打在你隊上，幾隻被剋',
    moveUsers: '誰會帶',
    threatTitle: '較難應對',
    threatBeats: '贏你幾隻',
    threatBeatsTip: '你隊上有幾隻打不贏牠',
    threatCol: '對手',
    threatEmpty: '這個範圍內沒有主流對手能贏你隊上任何一隻',
    verdict: (all: number, two: number) =>
      all ? `${all} 隻打穿你整隊` : two ? `${two} 隻贏你兩隻` : '沒有通殺你的對手',
    verdictTone: (all: number, two: number) => (all ? 'lose' : two ? '' : 'win'),
    pressureLead: '你最怕的屬性是',
  },
  foe: {
    toggle: '對手隊伍',
    slot: (i: number) => `對手第 ${i} 隻`,
    gridTitle: '屬性克制',
    gridCol: '我方屬性',
    gridCount: '剋幾隻',
    moveTitle: '建議招式',
    moveHits: '剋他們幾隻',
    moveHitsTip: '這一招打在對手隊上，幾隻被剋',
    moveUsers: '誰帶著這招',
    threatTitle: '建議使用',
    threatBeats: '贏他們幾隻',
    threatBeatsTip: '這一隻打得贏對手隊上幾隻',
    threatCol: '可以派的',
    threatEmpty: '這個範圍內沒有主流寶可夢能贏他們任何一隻',
    verdict: (all: number, two: number) =>
      all ? `${all} 隻打得穿他們整隊` : two ? `${two} 隻能贏他們兩隻` : '沒有能通殺他們的選擇',
    verdictTone: (all: number, two: number) => (all ? 'win' : two ? '' : 'lose'),
    pressureLead: '他們最怕的屬性是',
  },
} as const;

/**
 * 倍率對應的格子樣式。
 *
 * 顏色只講倍率大小（紅橘高、綠藍低），不跟著我方／對手翻面——
 * 同一個 ×0.39 在哪一張表都該是同一個顏色，不然要靠記憶才讀得懂。
 * 「對你好不好」交給欄位標題與勝負欄（那邊才是紅綠）。
 *
 * @param mult 傷害倍率
 */
function cellClass(mult: number): string {
  const c = effClass(mult);
  // 普通那一格也給個 class：×1.00 是「這裡沒事」，要比有顏色的那幾格淡
  return c ? `ef-${c}` : 'quiet';
}

/** 屬性盤點 */
function TypeGrid({ team, rows, side }: {
  team: PokemonData[];
  rows: ReturnType<typeof teamTypePressure>;
  side: Side;
}) {
  const c = COPY[side];
  // 先看倍率打到幾隻，同樣多的再看遇到率
  const sorted = [...rows].sort((a, b) => b.weak - a.weak || b.encounter - a.encounter);
  return (
    // 十八列是固定的，不該再有一層內捲
    <div className="tbl-scroll full">
      <table className="tbl grid">
        <thead>
          <tr>
            <th className="left">{c.gridCol}</th>
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

/** 招式清單。標題跟排序鈕同一排，排序鈕是這張表的開關，不該掉到別的地方 */
function ExposureList({ list, side, title }: { list: MoveExposure[]; side: Side; title: string }) {
  const c = COPY[side];
  const [all, setAll] = useState(false);
  const [by, setBy] = useState<'threat' | 'rate'>('threat');

  // 照威脅排：先看打到幾隻，同樣的再看遇到率。
  // 只照遇到率排的話，最常見但不痛不癢的招會塞滿前面，看不到重點。
  const sorted = useMemo(
    () => [...list].sort((a, b) => (by === 'threat' ? b.hits - a.hits || b.rate - a.rate : b.rate - a.rate)),
    [list, by]
  );
  const shown = all ? sorted : sorted.slice(0, 15);
  const hitClass = (n: number) =>
    n === 0 ? '' : side === 'mine' ? (n >= 2 ? 'bad2' : 'bad') : (n >= 2 ? 'good2' : 'good');

  return (
    <>
      <div className="blk-head">
        <h3>{title}</h3>
        <div className="blk-tools">
          {([['threat', '照威脅排'], ['rate', '照遇到率排']] as const).map(([k, label]) => (
            <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="tbl-scroll">
        <table className="tbl">
          <thead>
            <tr>
              <th className="left">招式</th>
              <th className="num" title="主流之中，預期有多少比例會帶這一招">遇到率</th>
              <th className="num" title="前 N 名主流裡有幾隻會帶">帶的隻數</th>
              <th className="num" title={c.moveHitsTip}>{c.moveHits}</th>
              <th className="left">{c.moveUsers}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.move.id} className={e.hits >= 2 ? 'hot' : ''}>
                <td className="left nm">
                  <TypeIcon type={e.move.type} size={14} />
                  <span>{zhName(e.move)}</span>
                  <MoveNums m={e.move} ratios={false} />
                </td>
                <td className="num">{pct(e.rate)}</td>
                <td className="num dim">{e.users.length}</td>
                <td className={`num ${hitClass(e.hits)}`}>{e.hits || '—'}</td>
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

/** 對位名單 */
function ThreatList({ threats, team, side }: { threats: Threat[]; team: PokemonData[]; side: Side }) {
  const c = COPY[side];
  const [open, setOpen] = useState<string | null>(null);
  const shown = threats.filter((t) => t.beats > 0).slice(0, 25);
  if (!shown.length) return <div className="tbl-empty">{c.threatEmpty}</div>;

  const beatsClass = (n: number) =>
    side === 'mine'
      ? (n === 3 ? 'bad2' : n === 2 ? 'bad' : '')
      : (n === 3 ? 'good2' : n === 2 ? 'good' : '');

  /**
   * 一格要顯示誰的結果。
   * 我方模式下，一列是威脅、欄是我的三隻，所以講我的三隻贏沒贏；
   * 對手模式下，一列是我可以派的，欄是對手三隻，要講的是「我派牠上去贏不贏」。
   * 兩邊都讓「贏」＝綠色＝對你是好事，不用自己在腦袋裡轉。
   */
  const cell = (v: Threat['vs'][number]) => {
    const good = side === 'mine' ? v.win : !v.win;
    return { good, label: good ? '贏' : '輸', rating: side === 'mine' ? v.rating : v.oppRating };
  };

  return (
    // fill：兩欄並排時高度跟左邊的屬性克制表對齊，多的自己捲
    <div className="tbl-scroll fill">
      <table className="tbl">
        <thead>
          <tr>
            <th className="num">排名</th>
            <th className="left">{c.threatCol}</th>
            <th className="num" title={c.threatBeatsTip}>{c.threatBeats}</th>
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
                  <span className="caret" aria-hidden>{open === t.id ? '▾' : '▸'}</span>
                </td>
                <td className={`num ${beatsClass(t.beats)}`}>{t.beats}／3</td>
                {t.vs.map((v, i) => {
                  const x = cell(v);
                  return (
                    <td key={i} className={`num ${x.good ? 'good' : 'bad'}`} title={`對位評分 ${x.rating}／1000`}>
                      {x.label}<small className="dim"> {x.rating}</small>
                    </td>
                  );
                })}
              </tr>
              {open === t.id && (
                <tr className="detail">
                  <td />
                  <td className="left sm" colSpan={2 + team.length}>
                    招式：
                    {t.moves.map((m) => (
                      <span key={m.id} className="mv">
                        <TypeIcon type={m.type} size={12} />
                        {zhName(m)}
                        <MoveNums m={m} ratios={false} />
                      </span>
                    ))}
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
 * 放三隻進去，可以當成自己的隊伍看（我被什麼剋），也可以當成對手的隊伍看
 * （我該拿什麼打）。兩邊的計算完全一樣，差的只是同一個倍率對你是好是壞，
 * 所以用一個切換把字與顏色翻面，不用自己在腦袋裡轉。
 */
export default function TeamTable({ data, cp }: { data: AppData; cp: LeagueCp }) {
  const [side, setSide] = useState<Side>('mine');
  const [team, setTeam] = useState<SideConfig[]>([]);
  const [metaN, setMetaN] = useState(50);
  const [otherShields, setOtherShields] = useState(1);

  const c = COPY[side];
  const list = data.listFor(cp);

  // 預設放這個聯盟的前三名；換聯盟時重算推薦招式但保留選的是誰
  useEffect(() => {
    if (list.length < 3) return;
    setTeam((prev) => {
      const ids = prev.length === 3 ? prev.map((x) => x.id) : [list[0].id, list[1].id, list[2].id];
      return ids.map((id, i) => ({ ...data.defaultsFor(id, cp), shields: prev[i]?.shields ?? 1 }));
    });
  }, [data, cp, list]);

  const mons = useMemo(
    () => team.map((x) => data.monById.get(x.id)).filter(Boolean) as PokemonData[],
    [team, data]
  );

  const loadouts = useMemo(
    () => team.map((x) => data.toLoadout(x, cp, 'optimal')).filter(Boolean) as Loadout[],
    [team, data, cp]
  );

  /** 要拿來對位的主流清單：照排名取前 N，用牠們的推薦招式 */
  const others = useMemo(() => {
    const out: { loadout: Loadout; rank: number }[] = [];
    data.rowsFor(cp).slice(0, metaN).forEach((r, i) => {
      const cfg = { ...data.defaultsFor(r.id, cp), shields: otherShields };
      const l = data.toLoadout(cfg, cp, 'optimal');
      if (l) out.push({ loadout: l, rank: i + 1 });
    });
    return out;
  }, [data, cp, metaN, otherShields]);

  const exposure = useMemo(
    () => (mons.length ? moveExposure(data.rowsFor(cp), data.monById, data.moveById, mons, metaN) : []),
    [data, cp, mons, metaN]
  );

  const pressure = useMemo(
    () => teamTypePressure(mons, encounterByType(exposure)),
    [mons, exposure]
  );

  const threats = useMemo(
    () => (loadouts.length === 3 ? scanThreats(loadouts, others) : []),
    [loadouts, others]
  );

  if (team.length < 3) return null;

  const all3 = threats.filter((t) => t.beats === 3).length;
  const two = threats.filter((t) => t.beats === 2).length;
  const worstType = [...pressure].sort((a, b) => b.weak * 10 + b.encounter - (a.weak * 10 + a.encounter))[0];

  return (
    <>
      <div className="leagues sub center">
        {(['mine', 'foe'] as const).map((s) => (
          <button key={s} aria-pressed={side === s} onClick={() => setSide(s)}>{COPY[s].toggle}</button>
        ))}
      </div>

      <div className="sides three">
        {team.map((cfg, i) => (
          <SidePanel
            key={i}
            title={c.slot(i + 1)}
            cls={side === 'mine' ? 'you' : 'foe'}
            compact
            cfg={cfg}
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
        <span className="hint" style={{ marginLeft: 10 }}>{side === 'mine' ? '對手護盾' : '我方護盾'}</span>
        {[0, 1, 2].map((n) => (
          <button key={n} aria-pressed={otherShields === n} onClick={() => setOtherShields(n)}>{n}</button>
        ))}
      </div>

      <div className="verdict">
        <span className={`big ${c.verdictTone(all3, two)}`}>{c.verdict(all3, two)}</span>
        <span className="sub">
          {c.pressureLead} {worstType ? TYPE_ZH[worstType.type] : '—'}
        </span>
      </div>

      {/* 屬性盤點與對位掃描講的是同一件事的兩面，放一起比對 */}
      <div className="blk-row">
        <section className="blk">
          <h3>{c.gridTitle}</h3>
          <TypeGrid team={mons} rows={pressure} side={side} />
        </section>

        <section className="blk">
          <h3>{c.threatTitle}</h3>
          <ThreatList threats={threats} team={mons} side={side} />
        </section>
      </div>

      <section className="blk">
        <ExposureList list={exposure} side={side} title={c.moveTitle} />
      </section>
    </>
  );
}
