'use client';

import { TypeIcon } from '@/components/Icon';
import type { BattleResult, SideKey, TurnRecord } from '@/lib/battle';

/** HP 或能量的小長條 */
function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <span className="bar">
      <i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </span>
  );
}

/** 單側在某回合做了什麼 */
function Act({ turn, side }: { turn: TurnRecord; side: SideKey }) {
  const cls = side === 'a' ? 'act' : 'act foe';
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
          <span className="prog">⚡+{e.energyGain}</span>
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
          <span className="nm">💥 {e.move}</span>
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
    <div className={cls}>
      {side === 'b' && (
        <span className="mini">
          <span className="en">⚡{snap.energy}</span>
          <Bar pct={(snap.hp / snap.maxHp) * 100} color="var(--foe)" />
          {snap.hp}
        </span>
      )}
      {parts.length === 0 && snap.fastProgress && (
        <span className="prog">蓄招 {snap.fastProgress[0]}/{snap.fastProgress[1]}</span>
      )}
      {parts}
      {side === 'a' && (
        <span className="mini">
          {snap.hp}
          <Bar pct={(snap.hp / snap.maxHp) * 100} color="var(--you)" />
          <span className="en">⚡{snap.energy}</span>
        </span>
      )}
    </div>
  );
}

/**
 * 逐回合時間軸。這是整個工具的重點：
 * 把「第幾回合該按什麼」攤開來，而不是只給一個勝負。
 */
export default function Timeline({ result, names }: { result: BattleResult; names: [string, string] }) {
  const { analysis } = result;
  const rows = result.turns.slice(0, result.endTurn);

  /** 在對應回合插入提示文字 */
  function noteFor(turn: number): string | null {
    const na = analysis.firstChargedTurn.a;
    const nb = analysis.firstChargedTurn.b;
    if (na && turn === na.turn) return `${names[0]} 最快在這一回合按得下第一發 ${na.move}（累積 ${na.fastNeeded} 次快招）`;
    if (nb && turn === nb.turn) return `${names[1]} 最快在這一回合按得下第一發 ${nb.move}（累積 ${nb.fastNeeded} 次快招）`;
    return null;
  }

  return (
    <div className="tl">
      <div className="head">
        <h3>逐回合時間軸</h3>
        <span className="hint">1 回合 = 0.5 秒 · 💥 為大招發動回合</span>
      </div>
      <div className="rows">
        {rows.map((t) => {
          const note = noteFor(t.turn);
          const isKey = t.events.some((e) => e.kind === 'charged');
          return (
            <div key={t.turn} className={`row${isKey ? ' key' : ''}`}>
              <span className="t">
                <b>T{t.turn}</b> {t.seconds.toFixed(1)}s
              </span>
              <Act turn={t} side="a" />
              <Act turn={t} side="b" />
              {note && <div className="note">↑ {note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
