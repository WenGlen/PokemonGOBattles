'use client';

import { useEffect, useState } from 'react';
import BoxTab from '@/components/BoxTab';
import ChangelogView from '@/components/Changelog';
import Simulator from '@/components/Simulator';
import MoveTable from '@/components/MoveTable';
import PokemonTable from '@/components/PokemonTable';
import TeamTable from '@/components/TeamTable';
import { useAppData } from '@/lib/app-data';
import { useBox } from '@/lib/collection';
import { LEAGUES, type LeagueCp } from '@/lib/stats';
import type { PokemonData } from '@/lib/types';

const TABS = [
  { id: 'pokemon', label: '寶可夢表', league: true },
  { id: 'moves', label: '招式表', league: false },
  { id: 'team', label: '對戰組合表', league: true },
  { id: 'sim', label: '模擬器', league: true },
  { id: 'box', label: '我的箱子', league: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** 沒帶 hash 就開第一個分頁，順序一改就跟著改 */
const FIRST: TabId = TABS[0].id;

/** 網址的 #hash 當分頁狀態，這樣分享連結可以直接開在同一頁 */
function hashTab(): TabId {
  if (typeof window === 'undefined') return FIRST;
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? (h as TabId) : FIRST;
}

export default function Page() {
  const data = useAppData();
  const [tab, setTab] = useState<TabId>(FIRST);
  const [cp, setCp] = useState<LeagueCp>(1500);
  const box = useBox();

  // 開啟時讀網址，之後跟著上一頁／下一頁走
  useEffect(() => {
    setTab(hashTab());
    const onHash = () => setTab(hashTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function go(id: TabId) {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  if (!data) {
    return <div className="wrap"><div className="loading">載入資料中…</div></div>;
  }

  const { meta, log } = data;
  /** 箱子裡那幾隻的完整資料，變動日誌要用它標出「打到你頭上」的那幾版 */
  const owned = box.list.map((o) => data.monById.get(o.id)).filter(Boolean) as PokemonData[];
  const okCount = meta.checks.filter((c) => c.ok).length;
  const showLeague = TABS.find((t) => t.id === tab)?.league ?? false;

  return (
    <div className="wrap">
      <header className="top">
        <h1>寶可夢 GO 對戰模擬器</h1>
        <span className="chip">2026-06-23 新版系統</span>
        <span className="meta">
          資料 {meta.gamemasterTimestamp.slice(0, 10)} · {meta.source.repo} · 驗證 <b>{okCount}/{meta.checks.length} 通過</b>
        </span>
      </header>

      <nav className="navbar">
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} aria-pressed={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </div>
        {/* 招式表不分聯盟。整排收掉會讓下面的內容往上跳一層，所以留著變暗 */}
        <div className={`leagues${showLeague ? '' : ' off'}`}>
          {LEAGUES.map((lg) => (
            <button
              key={lg.cp}
              disabled={!showLeague}
              title={showLeague ? undefined : '招式表不分聯盟'}
              aria-pressed={cp === lg.cp}
              onClick={() => setCp(lg.cp)}
            >
              {lg.name}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'sim' && <Simulator data={data} cp={cp} />}
      {tab === 'moves' && <MoveTable data={data} />}
      {tab === 'pokemon' && <PokemonTable data={data} cp={cp} box={box} />}
      {tab === 'team' && <TeamTable data={data} cp={cp} />}
      {tab === 'box' && <BoxTab data={data} cp={cp} box={box} />}

      {log && log.entries.length > 0 && <ChangelogView log={log} owned={owned} />}

      <div className="foot">
        資料源 <a href="https://github.com/pvpoke/pvpoke" target="_blank" rel="noreferrer">pvpoke/pvpoke</a>（MIT）
        · 對戰規則照 <a href="https://pokemongo.com/news/pvp-updates2026" target="_blank" rel="noreferrer">官方 2026-06-23 公告</a>
        · 更新資料跑 <code>npm run data</code>，驗證跑 <code>npm run verify</code>
        <br />
        出招決策是 pvpoke 搜尋演算法的簡化版，勝負方向與 pvpoke 官方對位結果一致率約 80%；傷害、能量、回合時序則為精確計算。
      </div>
    </div>
  );
}
