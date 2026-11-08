'use client';

import { useEffect, useRef, useState } from 'react';
import { TypeIcon } from '@/components/Icon';
import { zhName, type MoveData } from '@/lib/types';

/** 一列招式：屬性圖示 ＋ 名字 ＋ 數值 */
function Row({ m, fast }: { m: MoveData; fast: boolean }) {
  return (
    <>
      <TypeIcon type={m.type} size={15} />
      <span className="mp-name">{zhName(m)}</span>
      <span className="mp-num">
        {m.power}力
        {fast ? ` · ${m.turns}回合 · ⚡+${m.energyGain}` : ` · ⚡${m.energy}`}
      </span>
    </>
  );
}

/**
 * 招式選單。
 *
 * 用自訂選單而不是原生 select，是因為 option 裡放不了圖片——
 * 招式在遊戲裡是靠屬性圖示辨認的，少了那個圖就只剩一串字。
 *
 * @param moves 可選的招式
 * @param value 目前選到的招式 id，null 代表沒帶
 * @param onChange 選擇後的回呼，null 代表清掉
 * @param fast true 顯示快招的數值欄位（回合數與能量獲得）
 * @param allowEmpty true 時多一個「不帶這一招」的選項
 */
export default function MovePicker({
  moves, value, onChange, fast = false, allowEmpty = false,
}: {
  moves: MoveData[];
  value: string | null;
  onChange: (id: string | null) => void;
  fast?: boolean;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = moves.find((m) => m.id === value) ?? null;
  /** null 當作「不帶這一招」那一列 */
  const options: (MoveData | null)[] = allowEmpty ? [null, ...moves] : moves;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(m: MoveData | null) {
    onChange(m?.id ?? null);
    setOpen(false);
  }

  return (
    <div className="mp" ref={boxRef}>
      <button
        type="button"
        className="mp-btn"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setActive(Math.max(0, options.findIndex((m) => (m?.id ?? null) === value)));
        }}
        onKeyDown={(e) => {
          // 開了之後焦點還在按鈕上，所以方向鍵也在這裡處理
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
            setActive(Math.max(0, options.findIndex((m) => (m?.id ?? null) === value)));
          } else if (open && e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
          else if (open && e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (open && e.key === 'Enter') { e.preventDefault(); pick(options[active]); }
          else if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        }}
      >
        {selected ? <Row m={selected} fast={fast} /> : <span className="mp-name mp-empty">（不帶這一招）</span>}
        <span className="mp-chev" aria-hidden>▾</span>
      </button>

      {open && (
        <ul ref={listRef} role="listbox">
          {options.map((m, i) => (
            <li
              key={m?.id ?? '_none'}
              role="option"
              aria-selected={(m?.id ?? null) === value}
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(m)}
            >
              {m ? <Row m={m} fast={fast} /> : <span className="mp-name mp-empty">（不帶這一招）</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
