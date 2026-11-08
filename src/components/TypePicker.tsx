'use client';

import { useEffect, useRef, useState } from 'react';
import { TypeIcon } from '@/components/Icon';
import { ALL_TYPES } from '@/lib/analysis';
import { TYPE_ZH } from '@/lib/typeChart';

/**
 * 屬性選單。
 *
 * 跟招式選單同一個理由：原生 option 裡放不了圖片，
 * 而屬性在遊戲裡就是靠圖示認的，只剩文字會慢一拍。
 *
 * @param value 選到的屬性，空字串代表不限
 * @param onChange 選擇後的回呼
 * @param anyLabel 「不限」那一列要寫什麼
 * @param label 選到某個屬性時整列怎麼寫，預設只寫屬性名
 * @param wide 選項文字比較長時放寬一點，避免切字
 */
export default function TypePicker({
  value, onChange, anyLabel, label = (zh) => zh, wide = false, title,
}: {
  value: string;
  onChange: (t: string) => void;
  anyLabel: string;
  label?: (zh: string) => string;
  wide?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  /** 空字串當作「不限」那一列 */
  const options = ['', ...ALL_TYPES];

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

  function pick(t: string) {
    onChange(t);
    setOpen(false);
  }

  const row = (t: string) =>
    t
      ? <><TypeIcon type={t} size={15} /><span className="mp-name">{label(TYPE_ZH[t] ?? t)}</span></>
      : <span className="mp-name mp-empty">{anyLabel}</span>;

  return (
    <div className={`mp tp${wide ? ' wide' : ''}`} data-on={value ? 'true' : undefined} ref={boxRef}>
      <button
        type="button"
        className="mp-btn"
        title={title}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          setActive(Math.max(0, options.indexOf(value)));
        }}
        onKeyDown={(e) => {
          // 開了之後焦點還在按鈕上，所以方向鍵也在這裡處理
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
            setActive(Math.max(0, options.indexOf(value)));
          } else if (open && e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
          else if (open && e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (open && e.key === 'Enter') { e.preventDefault(); pick(options[active]); }
          else if (open && e.key === 'Escape') { e.preventDefault(); setOpen(false); }
        }}
      >
        {row(value)}
        <span className="mp-chev" aria-hidden>▾</span>
      </button>

      {open && (
        <ul ref={listRef} role="listbox">
          {options.map((t, i) => (
            <li
              key={t || '_any'}
              role="option"
              aria-selected={t === value}
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(t)}
            >
              {row(t)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
