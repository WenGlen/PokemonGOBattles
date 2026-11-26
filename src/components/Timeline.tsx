'use client';

import { Fragment, useEffect, useState } from 'react';
import { BoltIcon, BurstIcon, PokemonIcon, ShieldIcon, TypeIcon } from '@/components/Icon';
import type { BattleResult, SideKey, Snapshot, TurnRecord } from '@/lib/battle';
import { zhName, type PokemonData } from '@/lib/types';

/** HP 或能量的小長條 */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="bar">
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}

/**
 * 單側在某回合做了什麼。
 * 只放「做了什麼」——血量與能量在表格裡各自有欄，塞進來只會讓招式左右跑。
 */
function Act({ turn, side }: { turn: TurnRecord; side: SideKey }) {
  const color = side === 'a' ? 'you' : 'foe';
  const evs = turn.events.filter((e) => 'side' in e && e.side === side);
  const snap = side === 'a' ? turn.a : turn.b;

  const parts = evs.map((e, i) => {
    if (e.kind === 'fast') {
      return (
        <span key={i} style={{ display: 'contents' }}>
          {e.moveType && <TypeIcon type={e.moveType} size={13} />}
          <span className="nm">{e.move}</span>
          <span className={`dmg ${color}`}>−{e.damage}</span>
          <span className="prog"><BoltIcon size={10} />+{e.energyGain}</span>
        </span>
      );
    }
    if (e.kind === 'trigger') {
      return (
        <span key={i} className="tag">
          {e.moveType && <TypeIcon type={e.moveType} size={12} />}按下 {e.move}
        </span>
      );
    }
    if (e.kind === 'charged') {
      return (
        <span key={i} style={{ display: 'contents' }}>
          {e.moveType && <TypeIcon type={e.moveType} size={13} />}
          <span className="nm"><BurstIcon size={11} /> {e.move}</span>
          {e.shielded ? <span className="tag shield">被擋</span> : <span className={`dmg ${color}`}>−{e.damage}</span>}
          {e.cmpWin && <span className="tag cmp">CMP 搶先</span>}
          {e.buffText && <span className="tag">{e.buffText}</span>}
        </span>
      );
    }
    if (e.kind === 'faint') return <span key={i} className="ko">倒下</span>;
    return null;
  });

  return (
    <div className="act">
      {parts.length === 0 && snap.fastProgress && (
        <span className="prog">蓄招 {snap.fastProgress[0]}/{snap.fastProgress[1]}</span>
      )}
      {parts}
    </div>
  );
}


/** 這一回合某一側做了什麼，寫成一行字。gain 另外給，因為能量要用圖示不是字 */
function lineFor(
  turn: TurnRecord,
  side: SideKey
): { text: string; type?: string; kind: string; gain?: number } | null {
  for (const e of turn.events) {
    if (!('side' in e) || e.side !== side) continue;
    if (e.kind === 'charged') {
      return {
        kind: 'charged',
        type: e.moveType,
        text: e.shielded ? `${e.move} 被擋下` : `${e.move} −${e.damage}`,
      };
    }
    if (e.kind === 'fast') return { kind: 'fast', type: e.moveType, text: `${e.move} −${e.damage}`, gain: e.energyGain };
    if (e.kind === 'trigger') return { kind: 'trigger', type: e.moveType, text: `按下 ${e.move}` };
    if (e.kind === 'faint') return { kind: 'faint', text: '倒下' };
  }
  const snap = side === 'a' ? turn.a : turn.b;
  if (snap.fastProgress) return { kind: 'prog', text: `蓄招 ${snap.fastProgress[0]}/${snap.fastProgress[1]}` };
  return null;
}

/** 播放器裡的一側：頭像、HP、能量、護盾 */
function Fighter({ p, snap, side, line }: {
  p: PokemonData;
  snap: Snapshot;
  side: SideKey;
  line: ReturnType<typeof lineFor>;
}) {
  const color = side === 'a' ? 'var(--you)' : 'var(--foe)';
  return (
    <div className={`pl-side${side === 'b' ? ' foe' : ''}`}>
      <div className="pl-who">
        <PokemonIcon key={p.icon} icon={p.icon} alt={zhName(p)} size={52} shadow={Boolean(p.shadow)} />
        <div className="pl-name">
          <b>{zhName(p)}</b>
          <span className="pl-shields" aria-label={`護盾 ${snap.shields}`}>
            {[0, 1].map((n) => (
              <i key={n} className={n < snap.shields ? 'on' : undefined} aria-hidden><ShieldIcon size={12} /></i>
            ))}
            {(snap.atkStage !== 0 || snap.defStage !== 0) && (
              <em>
                {snap.atkStage !== 0 && `攻${snap.atkStage > 0 ? '+' : ''}${snap.atkStage}`}
                {snap.atkStage !== 0 && snap.defStage !== 0 && ' '}
                {snap.defStage !== 0 && `防${snap.defStage > 0 ? '+' : ''}${snap.defStage}`}
              </em>
            )}
          </span>
        </div>
      </div>

      <div className="pl-gauge">
        <span className="pl-num">{snap.hp}<small>/{snap.maxHp}</small></span>
        <span className="bar hp"><i style={{ width: `${(snap.hp / snap.maxHp) * 100}%`, background: color }} /></span>
      </div>
      <div className="pl-gauge">
        <span className="pl-num en"><BoltIcon size={11} />{snap.energy}</span>
        <span className="bar en"><i style={{ width: `${Math.min(100, snap.energy)}%`, background: 'var(--warn)' }} /></span>
      </div>

      <div className={`pl-line${line ? ` ${line.kind}` : ''}`}>
        {line?.type && <TypeIcon type={line.type} size={14} />}
        <span>{line?.text ?? '—'}</span>
        {line?.gain !== undefined && <span className="pl-gain"><BoltIcon size={10} />+{line.gain}</span>}
      </div>
    </div>
  );
}

/**
 * 對戰播放器。
 *
 * 逐回合的表格看得到每一步，但看不出「現在剩多少血、能量到哪了」的推進感；
 * 播放器就是把同一份資料當成一場比賽播出來。資料完全一樣，只是換個看法。
 */
function Player({ result, mons }: { result: BattleResult; mons: [PokemonData, PokemonData] }) {
  const last = Math.max(0, result.endTurn - 1);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // 換對位就從頭開始，不然會停在上一場的回合數
  useEffect(() => {
    setI(0);
    setPlaying(false);
  }, [result]);

  // 一回合一個 timeout，不用 interval：這樣暫停、拖動、變速都只是重設下一步
  useEffect(() => {
    if (!playing) return;
    if (i >= last) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setI((n) => n + 1), 500 / speed);
    return () => clearTimeout(id);
  }, [playing, i, last, speed]);

  const turn = result.turns[i] ?? result.turns[0];
  if (!turn) return null;

  const pct = last ? (i / last) * 100 : 0;
  /** 大招發動的回合標在軸上，一眼看得出節奏 */
  const marks = result.turns.slice(0, result.endTurn).flatMap((t, n) => {
    const ev = t.events.find((e) => e.kind === 'charged');
    return ev && 'side' in ev ? [{ n, side: ev.side }] : [];
  });

  return (
    <div className="pl">
      <div className="pl-stage">
        <Fighter p={mons[0]} snap={turn.a} side="a" line={lineFor(turn, 'a')} />
        <div className="pl-clock">
          <b>T{turn.turn}</b>
          <span>{turn.seconds.toFixed(1)}s</span>
          <small>共 {result.endTurn} 回合</small>
        </div>
        <Fighter p={mons[1]} snap={turn.b} side="b" line={lineFor(turn, 'b')} />
      </div>

      <div className="pl-track">
        <input
          className="pl-scrub"
          type="range"
          min={0}
          max={last}
          value={i}
          aria-label="回合"
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
          style={{ background: `linear-gradient(to right, var(--accent) ${pct}%, var(--surface-2) ${pct}%)` }}
        />
        <div className="pl-marks" aria-hidden>
          {marks.map((m) => (
            <i
              key={`${m.n}-${m.side}`}
              className={m.side === 'a' ? 'you' : 'foe'}
              style={{ left: `${last ? (m.n / last) * 100 : 0}%` }}
            />
          ))}
        </div>
      </div>

      <div className="pl-bar">
        <button onClick={() => { setPlaying(false); setI(0); }} title="回到第一回合">⏮</button>
        <button onClick={() => { setPlaying(false); setI((n) => Math.max(0, n - 1)); }} title="上一回合">◀</button>
        <button
          className="play"
          onClick={() => setPlaying((v) => (i >= last ? (setI(0), true) : !v))}
          title={playing ? '暫停' : '播放'}
        >
          {playing ? '⏸ 暫停' : '▶ 播放'}
        </button>
        <button onClick={() => { setPlaying(false); setI((n) => Math.min(last, n + 1)); }} title="下一回合">▶</button>
        <span className="pl-speed">
          {[1, 2, 4].map((s) => (
            <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>×{s}</button>
          ))}
        </span>
        <span className="pl-hint">實際速度 1 回合 = 0.5 秒 · 軸上的點是大招發動</span>
      </div>
    </div>
  );
}

/**
 * 逐回合時間軸。這是整個工具的重點：
 * 把「第幾回合該按什麼」攤開來，而不是只給一個勝負。
 */
export default function Timeline({ result, names, mons }: {
  result: BattleResult;
  names: [string, string];
  mons: [PokemonData, PokemonData];
}) {
  const { analysis } = result;
  const rows = result.turns.slice(0, result.endTurn);
  const [openLog, setOpenLog] = useState(true);

  /** 在對應回合插入提示文字 */
  function noteFor(turn: number): string | null {
    const na = analysis.firstChargedTurn.a;
    const nb = analysis.firstChargedTurn.b;
    if (na && turn === na.turn) return `${names[0]} 最快在這一回合按得下第一發 ${na.move}（累積 ${na.fastNeeded} 次快招）`;
    if (nb && turn === nb.turn) return `${names[1]} 最快在這一回合按得下第一發 ${nb.move}（累積 ${nb.fastNeeded} 次快招）`;
    return null;
  }

  return (
    <>
      <Player result={result} mons={mons} />

      <div className="tl">
        <button className="head" onClick={() => setOpenLog((v) => !v)} aria-expanded={openLog}>
          <h3>逐回合明細</h3>
          <span className="hint">
            1 回合 = 0.5 秒 · <BurstIcon size={11} /> 為大招發動回合 · {openLog ? '收合' : '展開'}
          </span>
        </button>
        {openLog && (
          <div className="rows">
            {/* 表格而不是自由排版：時間、能量、血量各自占一欄，
                數字位數變了也只撐開那一欄，招式永遠從同一個位置開始。
                能量擺在最外側，兩邊對稱，中間留給真正要讀的「做了什麼」 */}
            <table className="log">
              <tbody>
                {rows.map((t) => {
                  const note = noteFor(t.turn);
                  const isKey = t.events.some((e) => e.kind === 'charged');
                  return (
                    <Fragment key={t.turn}>
                      <tr className={isKey ? 'key' : undefined}>
                        <td className="lg-t"><b>T{t.turn}</b> {t.seconds.toFixed(1)}s</td>
                        <td className="lg-en">
                          <span className="lg-cell"><BoltIcon size={10} />{t.a.energy}</span>
                        </td>
                        <td className="lg-hp">
                          <span className="lg-cell">
                            {t.a.hp}<Bar pct={(t.a.hp / t.a.maxHp) * 100} color="var(--you)" />
                          </span>
                        </td>
                        <td className="lg-act"><Act turn={t} side="a" /></td>
                        <td className="lg-act"><Act turn={t} side="b" /></td>
                        <td className="lg-hp foe">
                          <span className="lg-cell">
                            <Bar pct={(t.b.hp / t.b.maxHp) * 100} color="var(--foe)" />{t.b.hp}
                          </span>
                        </td>
                        <td className="lg-en foe">
                          <span className="lg-cell"><BoltIcon size={10} />{t.b.energy}</span>
                        </td>
                      </tr>
                      {note && (
                        <tr className="lg-note">
                          <td colSpan={7}>↑ {note}</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
