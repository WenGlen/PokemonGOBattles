'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PokemonIcon } from '@/components/Icon';
import { zhName, type PokemonData } from '@/lib/types';

/**
 * 可搜尋的寶可夢選單。支援鍵盤上下選、Enter 確認、Esc 關閉。
 * @param list 候選清單（呼叫端已按排名排序）
 * @param value 目前選到的 id
 * @param onChange 選擇後的回呼
 */
export default function Combo({
  list,
  value,
  onChange,
}: {
  list: PokemonData[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = list.find((p) => p.id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list.slice(0, 60);
    // 畫面上只有中文，但英文名仍然可以搜——查國外攻略時打得出英文比較快
    return list
      .filter((p) => zhName(p).includes(q) || p.name.toLowerCase().includes(q) || String(p.dex) === q)
      .slice(0, 60);
  }, [list, query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="combo" ref={boxRef}>
      {selected && !open && (
        <span className="combo-pic">
          <PokemonIcon key={selected.icon} icon={selected.icon} alt={zhName(selected)} size={30} shadow={Boolean(selected.shadow)} />
        </span>
      )}
      <input
        type="text"
        value={open ? query : selected ? zhName(selected) : ''}
        placeholder="搜尋寶可夢（中文或英文）…"
        onFocus={() => { setOpen(true); setQuery(''); setActive(0); }}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); pick(filtered[active].id); }
          else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul ref={listRef}>
          {filtered.map((p, i) => (
            <li key={p.id} data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(p.id)}>
              <PokemonIcon key={p.icon} icon={p.icon} alt="" size={26} shadow={Boolean(p.shadow)} />
              <span className="dex">#{String(p.dex).padStart(3, '0')}</span>
              <span>{zhName(p)}</span>
            </li>
          ))}
          {filtered.length === 0 && <li style={{ color: 'var(--muted)' }}>找不到</li>}
        </ul>
      )}
    </div>
  );
}
