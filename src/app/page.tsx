'use client';

import { useEffect, useState } from 'react';
import BoxTab from '@/components/BoxTab';
import ChangelogView from '@/components/Changelog';
import Logo, { ballForCp } from '@/components/Logo';
import Simulator from '@/components/Simulator';
import MoveTable from '@/components/MoveTable';
import PokemonTable from '@/components/PokemonTable';
import TeamTable from '@/components/TeamTable';
import TypeTab from '@/components/TypeTab';
import { CheckIcon, MailIcon } from '@/components/Icon';
import { useAppData } from '@/lib/app-data';
import { useBox } from '@/lib/collection';
import { LEAGUES, type LeagueCp } from '@/lib/stats';
import type { PokemonData } from '@/lib/types';

const TABS = [
  { id: 'pokemon', label: '寶可夢', league: true },
  { id: 'types', label: '屬性', league: true },
  { id: 'moves', label: '招式', league: false },
  { id: 'team', label: '隊伍', league: true },
  { id: 'sim', label: '對戰模擬', league: true },
  { id: 'box', label: '箱子', league: true },
] as const;

type TabId = (typeof TABS)[number]['id'];

const FEEDBACK_TO = 'glenwen.studio@gmail.com';

/**
 * 建議回饋的 mailto。
 *
 * 分頁與資料版本先填進信裡：回饋最常漏掉的就是「在哪一頁看到的」，
 * 問一輪再回一輪很慢，不如寄出去的時候就帶著。
 *
 * @param tab 目前分頁
 * @param stamp 資料版本（gamemaster 的日期）
 */
function feedbackHref(tab: TabId, stamp: string) {
  const label = TABS.find((t) => t.id === tab)?.label ?? '';
  const body = [
    '（請寫下你的建議，或遇到的問題）',
    '',
    '',
    '— 以下是自動帶上的，方便對照，不用刪 —',
    `分頁：${label}`,
    `資料版本：${stamp}`,
  ].join('\n');
  return `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent('Pokémon GO 對戰表 建議回饋')}&body=${encodeURIComponent(body)}`;
}

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
      {/* 右下角那顆超大淡色站徽。純裝飾，所以放在 wrap 最前面、不佔版位 */}
      <div className="wm" aria-hidden="true"><Logo size={520} ball={ballForCp(cp)} /></div>

      <header className="top">
        <Logo size={36} ball={ballForCp(cp)} title="Pokémon GO 對戰表" />
        <div className="brandtxt">
          <h1>Pokémon GO 對戰表</h1>
          <p className="tagline">算清楚誰克誰、什麼時候出招</p>
        </div>
        {/* 全過就一個綠勾，沒全過才把數字攤出來——平常沒有人要讀 22/22 */}
        <span className="meta" title={`資料來自 ${meta.source.repo}，${meta.checks.length} 項檢查`}>
          {meta.gamemasterTimestamp.slice(0, 10)} 更新 ·{' '}
          {okCount === meta.checks.length
            ? <b className="ok" title="驗證通過" aria-label="驗證通過"><CheckIcon size={13} /></b>
            : <b className="bad">驗證 {okCount}/{meta.checks.length}</b>}
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
              title={showLeague ? lg.name : '招式不分聯盟'}
              aria-pressed={cp === lg.cp}
              onClick={() => setCp(lg.cp)}
            >
              {lg.short}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'sim' && <Simulator data={data} cp={cp} />}
      {tab === 'moves' && <MoveTable data={data} />}
      {tab === 'pokemon' && <PokemonTable data={data} cp={cp} box={box} />}
      {tab === 'types' && <TypeTab data={data} cp={cp} box={box} />}
      {tab === 'team' && <TeamTable data={data} cp={cp} />}
      {tab === 'box' && <BoxTab data={data} cp={cp} box={box} />}

      {log && log.entries.length > 0 && <ChangelogView log={log} owned={owned} />}

      <footer className="brand">
        <Logo size={40} />
        <div className="brand-txt">
          <b>Pokémon GO 對戰表</b>
          <span>本網站由 Glen Wen 使用 Claude code 開發</span>
          <span>
            資料源 <a href="https://github.com/pvpoke/pvpoke" target="_blank" rel="noreferrer">pvpoke/pvpoke</a>（MIT）
            · 對戰規則照{' '}
            <a href="https://pokemongo.com/news/pvp-updates2026" target="_blank" rel="noreferrer">官方 2026-06-23 公告</a>
          </span>
          <span>出招決策是 pvpoke 搜尋演算法的簡化版</span>
        </div>
        <a className="fb-btn" href={feedbackHref(tab, meta.gamemasterTimestamp.slice(0, 10))}>
          <MailIcon size={14} />建議回饋
        </a>
      </footer>
    </div>
  );
}
