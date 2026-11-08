'use client';

import { useEffect, useState } from 'react';
import ChangelogView from '@/components/Changelog';
import Simulator from '@/components/Simulator';
import MoveTable from '@/components/MoveTable';
import PokemonTable from '@/components/PokemonTable';
import TeamTable from '@/components/TeamTable';
import { useAppData } from '@/lib/app-data';
import { LEAGUES, type LeagueCp } from '@/lib/stats';

const TABS = [
  { id: 'sim', label: '模擬器', league: true },
  { id: 'moves', label: '招式表', league: false },
  { id: 'pokemon', label: '寶可夢表', league: true },
  { id: 'team', label: '對戰組合表', league: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** 網址的 #hash 當分頁狀態，這樣分享連結可以直接開在同一頁 */
function hashTab(): TabId {
  if (typeof window === 'undefined') return 'sim';
  const h = window.location.hash.replace('#', '');
  return TABS.some((t) => t.id === h) ? (h as TabId) : 'sim';
}

export default function Page() {
  const data = useAppData();
  const [tab, setTab] = useState<TabId>('sim');
  const [cp, setCp] = useState<LeagueCp>(1500);

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
  const okCount = meta.checks.filter((c) => c.ok).length;
  const showLeague = TABS.find((t) => t.id === tab)?.league;

  return (
    <div className="wrap">
      <header className="top">
        <h1>寶可夢 GO 對戰模擬器</h1>
        <span className="chip">2026-06-23 新版系統</span>
        <span className="meta">
          資料 {meta.gamemasterTimestamp.slice(0, 10)} · {meta.source.repo} · 驗證 <b>{okCount}/{meta.checks.length} 通過</b>
        </span>
      </header>

      {log && log.entries.length > 0 && <ChangelogView log={log} />}

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} aria-pressed={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>
        ))}
      </nav>

      {showLeague && (
        <div className="leagues">
          {LEAGUES.map((lg) => (
            <button key={lg.cp} aria-pressed={cp === lg.cp} onClick={() => setCp(lg.cp)}>{lg.name}</button>
          ))}
        </div>
      )}

      {tab === 'sim' && <Simulator data={data} cp={cp} />}
      {tab === 'moves' && <MoveTable data={data} />}
      {tab === 'pokemon' && <PokemonTable data={data} cp={cp} />}
      {tab === 'team' && <TeamTable data={data} cp={cp} />}

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
