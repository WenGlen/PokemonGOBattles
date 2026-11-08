'use client';

import { Fragment, useMemo, useState } from 'react';
import Combo from '@/components/Combo';
import { PokemonIcon, TypeIcon } from '@/components/Icon';
import MovePicker from '@/components/MovePicker';
import { simulate } from '@/lib/battle';
import type { AppData, SideConfig } from '@/lib/app-data';
import { clampIv, clampLevel, fitsLeague, parseIvs, type Box, type OwnedMon } from '@/lib/collection';
import { battleStats, suggestedBuild, type LeagueCp } from '@/lib/stats';
import { zhName, type MoveData, type PokemonData } from '@/lib/types';

/** 三個護盾情境都跑一次，因為同一組對位換個盾數常常就換邊 */
const SHIELDS = [0, 1, 2] as const;

/**
 * 一隻的三圍輸入：等級與 IV。
 * @param cpText 要附在後面的 CP。展開那一區不用給——同一列左邊就有一欄 CP，
 *   而且它跟著這裡的輸入即時變，再寫一次只是重複。
 */
function BuildFields({ level, ivs, onLevel, onIvs, cpText }: {
  level: number;
  ivs: [number, number, number];
  onLevel: (n: number) => void;
  onIvs: (v: [number, number, number]) => void;
  cpText?: string;
}) {
  return (
    <>
      <label className="bx-f">
        <span>等級</span>
        <input
          type="number" min={1} max={51} step={0.5} value={level}
          onChange={(e) => onLevel(clampLevel(Number(e.target.value)))}
        />
      </label>
      <label className="bx-f bx-iv">
        <span>IV 攻/防/HP</span>
        <input
          type="text" inputMode="numeric" value={ivs.join('/')} placeholder="15/15/15"
          // 檢定結果直接貼進來就好，斜線、空白、逗號都讀得出來
          onChange={(e) => { const v = parseIvs(e.target.value); if (v) onIvs(v); }}
          onBlur={(e) => { const v = parseIvs(e.target.value); onIvs(v ?? ivs.map(clampIv) as [number, number, number]); }}
        />
      </label>
      {cpText && <span className="bx-cp">{cpText}</span>}
    </>
  );
}

/** 加一隻進箱子 */
function AddForm({ data, cp, box }: { data: AppData; cp: LeagueCp; box: Box }) {
  const list = data.listFor(cp);
  const [id, setId] = useState('');
  const [level, setLevel] = useState(40);
  const [ivs, setIvs] = useState<[number, number, number]>([15, 15, 15]);

  const p = id ? data.monById.get(id) : null;
  const st = p ? battleStats(p.stats, ivs, level, Boolean(p.shadow)) : null;

  function pickMon(next: string) {
    setId(next);
    const mon = data.monById.get(next);
    if (!mon) return;
    // 先帶這個聯盟的建議個體當起點，改成自己的只要動兩個欄位
    const b = suggestedBuild(mon, cp);
    setLevel(b.level);
    setIvs(b.ivs);
  }

  function submit() {
    if (!p) return;
    const d = data.defaultsFor(p.id, cp);
    box.add({ id: p.id, level, ivs, fast: d.fast, charged: d.charged, added: Date.now() });
    setId('');
  }

  return (
    <div className="bx-add">
      <div className="bx-pick">
        <Combo list={list} value={id} onChange={pickMon} />
      </div>
      <BuildFields
        level={level} ivs={ivs} onLevel={setLevel} onIvs={setIvs}
        cpText={st ? `CP ${st.cp}` : ''}
      />
      <button className="bx-go" disabled={!p} onClick={submit}>
        {p && box.has(p.id) ? '更新' : '加進箱子'}
      </button>
    </div>
  );
}

/** 箱子裡的一列，展開可以改等級、IV 與招式 */
function BoxRow({ o, p, data, cp, box, open, onToggle }: {
  o: OwnedMon;
  p: PokemonData;
  data: AppData;
  cp: LeagueCp;
  box: Box;
  open: boolean;
  onToggle: () => void;
}) {
  const st = battleStats(p.stats, o.ivs, o.level, Boolean(p.shadow));
  const fits = fitsLeague(p, o, cp);
  const moves = [o.fast, ...o.charged].filter(Boolean).map((id) => data.moveById.get(id!)).filter(Boolean) as MoveData[];

  return (
    <>
      <tr className={fits ? undefined : 'quiet'} onClick={onToggle} style={{ cursor: 'pointer' }}>
        <td className="left nm">
          <PokemonIcon key={p.icon} icon={p.icon} alt="" size={28} shadow={Boolean(p.shadow)} />
          <span>{zhName(p)}</span>
          <small className="dim">{open ? '▾' : '▸'}</small>
        </td>
        <td className="num">Lv{o.level}</td>
        <td className="num">{o.ivs.join('/')}</td>
        <td className={`num${fits ? '' : ' bad'}`}>
          {st.cp}
          {!fits && <small className="dim"> 超過</small>}
        </td>
        <td className="num">{st.atk.toFixed(1)}</td>
        <td className="num">{st.def.toFixed(1)}</td>
        <td className="num">{st.hp}</td>
        <td className="left sm">
          {moves.map((m) => (
            <span key={m.id} className="mv"><TypeIcon type={m.type} size={12} />{zhName(m)}</span>
          ))}
        </td>
        <td className="num">
          <button
            className="panel-x"
            title="從箱子移除"
            onClick={(e) => { e.stopPropagation(); box.remove(o.id); }}
          >×</button>
        </td>
      </tr>
      {open && (
        <tr className="detail">
          <td colSpan={9}>
            <div className="bx-edit">
              <div className="bx-build">
                <BuildFields
                  level={o.level}
                  ivs={o.ivs}
                  onLevel={(n) => box.update(o.id, { level: n })}
                  onIvs={(v) => box.update(o.id, { ivs: v })}
                />
              </div>
              <div className="field">
                <label>快招</label>
                <MovePicker
                  fast
                  moves={p.fast.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[]}
                  value={o.fast}
                  onChange={(id) => id && box.update(o.id, { fast: id })}
                />
              </div>
              {[0, 1].map((slot) => (
                <div className="field" key={slot}>
                  <label>大招 {slot + 1}</label>
                  <MovePicker
                    allowEmpty={slot === 1}
                    moves={p.charged.map((id) => data.moveById.get(id)).filter(Boolean) as MoveData[]}
                    value={o.charged[slot]}
                    onChange={(id) => {
                      const next: [string, string | null] = [...o.charged] as [string, string | null];
                      next[slot] = id;
                      box.update(o.id, { charged: next });
                    }}
                  />
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** 對手這隻 → 我箱子裡誰能贏 */
function CounterLookup({ data, cp, owned }: {
  data: AppData;
  cp: LeagueCp;
  owned: { o: OwnedMon; p: PokemonData }[];
}) {
  const list = data.listFor(cp);
  const [foeId, setFoeId] = useState('');
  const [foeCfg, setFoeCfg] = useState<SideConfig | null>(null);

  function pickFoe(id: string) {
    setFoeId(id);
    setFoeCfg(id ? data.defaultsFor(id, cp) : null);
  }

  const foe = data.monById.get(foeId) ?? null;

  const rows = useMemo(() => {
    if (!foeCfg || !owned.length) return [];
    return owned
      .map(({ o, p }) => {
        const runs = SHIELDS.map((sh) => {
          // 兩邊同盾數：盾數差一個本來就會翻盤，混著比看不出是誰的功勞
          const mine = data.toLoadout(
            { id: o.id, fast: o.fast, charged: o.charged, shields: sh },
            cp, 'optimal', { level: o.level, ivs: o.ivs }
          );
          const theirs = data.toLoadout({ ...foeCfg, shields: sh }, cp, 'optimal');
          if (!mine || !theirs) return null;
          const r = simulate(mine, theirs);
          return { shields: sh, rating: r.analysis.rating.a, win: r.analysis.rating.a > 500 };
        }).filter(Boolean) as { shields: number; rating: number; win: boolean }[];
        const wins = runs.filter((r) => r.win).length;
        const total = runs.reduce((n, r) => n + r.rating, 0);
        return { o, p, runs, wins, total };
      })
      .sort((a, b) => b.wins - a.wins || b.total - a.total);
  }, [data, cp, foeCfg, owned]);

  return (
    <section className="blk">
      <h3>反制查詢</h3>
      <p className="blk-note">
        選一隻對手，看你箱子裡誰打得贏。三個護盾情境各跑一場，用的是<b>你自己的</b>等級、IV 與招式；
        對手用 pvpoke 在這個聯盟的推薦招式。出招決策是簡化版，拿來篩人選用，不是判決。
      </p>

      <div className="bx-foe">
        <div className="bx-pick">
          <Combo list={list} value={foeId} onChange={pickFoe} />
        </div>
        {foe && (
          <span className="bx-foe-ty">
            {foe.types.map((t) => <span key={t} className="chip type"><TypeIcon type={t} size={14} label /></span>)}
          </span>
        )}
      </div>

      {!foe && <div className="tbl-empty">先選一隻對手</div>}
      {foe && owned.length === 0 && <div className="tbl-empty">箱子裡還沒有這個聯盟進得去的寶可夢</div>}
      {foe && owned.length > 0 && (
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">我的寶可夢</th>
                {SHIELDS.map((s) => <th key={s} className="num">{s} 盾</th>)}
                <th className="num">贏幾種</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ o, p, runs, wins }) => (
                <tr key={o.id} className={wins === 3 ? 'hot' : ''}>
                  <td className="left nm">
                    <PokemonIcon key={p.icon} icon={p.icon} alt="" size={24} shadow={Boolean(p.shadow)} />
                    <span>{zhName(p)}</span>
                    <small className="dim">Lv{o.level} {o.ivs.join('/')}</small>
                  </td>
                  {runs.map((r) => (
                    <td key={r.shields} className={`num ${r.win ? 'good' : 'bad'}`} title={`對位評分 ${r.rating}／1000`}>
                      {r.win ? '贏' : '輸'}<small className="dim"> {r.rating}</small>
                    </td>
                  ))}
                  <td className={`num ${wins === 3 ? 'good2' : wins === 0 ? 'bad' : ''}`}>{wins}／3</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * 我的箱子。
 *
 * 其他分頁算的都是「理論上最好的那個個體」，但你手上就是沒有那一隻。
 * 這一頁存你實際擁有的等級、IV 與招式，反制查詢只拿這些去跑。
 * 資料只存在這台裝置（localStorage），不會上傳。
 */
export default function BoxTab({ data, cp, box }: { data: AppData; cp: LeagueCp; box: Box }) {
  const [open, setOpen] = useState<string | null>(null);

  /** 箱子裡還查得到資料的那幾隻；下架的寶可夢會查不到 */
  const rows = useMemo(
    () =>
      box.list
        .map((o) => ({ o, p: data.monById.get(o.id) }))
        .filter((x): x is { o: OwnedMon; p: PokemonData } => Boolean(x.p))
        .sort((a, b) => a.o.added - b.o.added),
    [box.list, data]
  );

  const usable = useMemo(() => rows.filter(({ o, p }) => fitsLeague(p, o, cp)), [rows, cp]);

  return (
    <>
      <div className="tbl-wrap">
        <div className="tbl-bar">
          <AddForm data={data} cp={cp} box={box} />
        </div>

        {box.ready && rows.length === 0 && (
          <div className="tbl-empty">
            箱子是空的。在上面搜尋一隻、填你實際的等級與 IV，或是到寶可夢表按每一列右邊的 ＋。
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div className="tbl-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="left">寶可夢</th>
                    <th className="num">等級</th>
                    <th className="num">IV</th>
                    <th className="num">CP</th>
                    <th className="num">攻擊</th>
                    <th className="num">防禦</th>
                    <th className="num">HP</th>
                    <th className="left">招式</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ o, p }) => (
                    <Fragment key={o.id}>
                      <BoxRow
                        o={o} p={p} data={data} cp={cp} box={box}
                        open={open === o.id}
                        onToggle={() => setOpen(open === o.id ? null : o.id)}
                      />
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bx-foot">
              箱子裡 {rows.length} 隻 · 這個聯盟進得去 {usable.length} 隻
              {usable.length < rows.length && '（超過 CP 上限的那幾隻灰掉，反制查詢不會算進去）'}
              · 只存在這台裝置，換裝置要重建
            </div>
          </>
        )}
      </div>

      <CounterLookup data={data} cp={cp} owned={usable} />
    </>
  );
}
