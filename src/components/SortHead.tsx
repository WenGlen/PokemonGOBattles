'use client';

/** 表格排序的狀態 */
export interface Sort<K extends string> {
  key: K;
  /** 1 = 小到大、-1 = 大到小 */
  dir: 1 | -1;
}

/**
 * 可點擊排序的表頭。
 * @param k 這一欄的鍵
 * @param sort 目前排序
 * @param setSort 點擊後更新；點同一欄會反向
 * @param defaultDir 第一次點這一欄時的方向，數值欄位通常想要大到小
 */
export default function SortHead<K extends string>({
  k, sort, setSort, defaultDir = -1, title, children, align = 'right',
}: {
  k: K;
  sort: Sort<K>;
  setSort: (s: Sort<K>) => void;
  defaultDir?: 1 | -1;
  title?: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const active = sort.key === k;
  return (
    <th className={`sortable ${align}`} title={title} aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort({ key: k, dir: active ? ((sort.dir * -1) as 1 | -1) : defaultDir })}>
        {children}
        <span className="arrow">{active ? (sort.dir === 1 ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}
