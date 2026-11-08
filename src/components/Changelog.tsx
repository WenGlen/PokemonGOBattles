'use client';

import { useMemo, useState } from 'react';
import { TYPE_ZH } from '@/lib/typeChart';
import type { Changelog, ChangelogEntry, FieldChange, MoveChange, MovesetChange, StatChange, TypeChange } from '@/lib/types';

const LEAGUE_ZH: Record<string, string> = { '1500': '超級', '2500': '高級', '10000': '大師' };

/**
 * 一次調整是變強還是變弱。
 * 威力與能量獲得往上是強化；能量需求與回合數往上反而是削弱。
 */
function direction(fields: FieldChange[]): '⬆' | '⬇' | '◆' {
  const num = (v: FieldChange['from']) => (typeof v === 'number' ? v : NaN);
  const up = fields.some((f) => (f.key === 'power' || f.key === 'energyGain') && num(f.to) > num(f.from))
    || fields.some((f) => (f.key === 'energy' || f.key === 'turns') && num(f.to) < num(f.from));
  const down = fields.some((f) => (f.key === 'power' || f.key === 'energyGain') && num(f.to) < num(f.from))
    || fields.some((f) => (f.key === 'energy' || f.key === 'turns') && num(f.to) > num(f.from));
  if (up && !down) return '⬆';
  if (down && !up) return '⬇';
  return '◆';
}

const fmt = (v: FieldChange['from']) =>
  v === null || v === undefined ? '—' : Array.isArray(v) ? `[${v.join(', ')}]` : String(v);

/** 一個變動群組：左邊是分類，右邊是內容 */
function Group({ label, tone, children }: { label: string; tone?: string; children: React.ReactNode }) {
  return (
    <div className="cg-group">
      <span className={`cg-label${tone ? ' ' + tone : ''}`}>{label}</span>
      <div className="cg-body">{children}</div>
    </div>
  );
}

/** 被截斷的清單尾巴 */
function More({ n }: { n: number }) {
  return n > 0 ? <span className="cg-more">…另外 {n} 筆</span> : null;
}

function MoveChangeRow({ m }: { m: MoveChange }) {
  const dir = direction(m.fields);
  return (
    <div className="cg-item">
      <span className={`cg-dir ${dir === '⬆' ? 'up' : dir === '⬇' ? 'down' : ''}`}>{dir}</span>
      <b>{m.zh}</b>
      {m.fields.map((f) => (
        <span key={f.key} className="cg-delta">
          {f.label} {fmt(f.from)} <i>→</i> {fmt(f.to)}
        </span>
      ))}
      {m.users.length > 0 && (
        <span className="cg-users">
          影響主流：{m.users.slice(0, 5).map((u) => `${u.zh}（${LEAGUE_ZH[u.league] ?? u.league} #${u.rank}）`).join('、')}
        </span>
      )}
    </div>
  );
}

function StatRow({ p }: { p: StatChange }) {
  return (
    <div className="cg-item">
      <b>{p.zh}</b>
      <span className="cg-delta">攻防HP {p.from.join('/')} <i>→</i> {p.to.join('/')}</span>
    </div>
  );
}

function TypeRow({ p }: { p: TypeChange }) {
  const zh = (t: string[]) => t.map((x) => TYPE_ZH[x] ?? x).join('·');
  return (
    <div className="cg-item">
      <b>{p.zh}</b>
      <span className="cg-delta">{zh(p.from)} <i>→</i> {zh(p.to)}</span>
    </div>
  );
}

function MovesetRow({ p }: { p: MovesetChange }) {
  return (
    <div className="cg-item">
      <b>{p.zh}</b>
      {p.gained.length > 0 && <span className="cg-gain">＋{p.gained.map((m) => m.zh).join('、')}</span>}
      {p.lost.length > 0 && <span className="cg-lost">－{p.lost.map((m) => m.zh).join('、')}</span>}
    </div>
  );
}

/** 一次更新的完整內容 */
function Entry({ e }: { e: ChangelogEntry }) {
  const c = e.counts;
  const ranked = e.rankings?.total ?? 0;
  return (
    <div className={`cg-entry${e.notable ? '' : ' quiet'}`}>
      <div className="cg-head">
        <b>{e.date}</b>
        {e.message && <span className="cg-msg">{e.message}</span>}
        {!e.notable && <span className="cg-tag">沒有影響對戰的變動</span>}
      </div>

      {c.movesChanged > 0 && (
        <Group label="招式調整" tone="hot">
          {e.moves.changed.items.map((m) => <MoveChangeRow key={m.id} m={m} />)}
          <More n={e.moves.changed.more} />
        </Group>
      )}
      {c.movesAdded > 0 && (
        <Group label="新招式">
          <div className="cg-item">{e.moves.added.items.map((m) => m.zh).join('、')}<More n={e.moves.added.more} /></div>
        </Group>
      )}
      {c.movesRemoved > 0 && (
        <Group label="移除招式">
          <div className="cg-item">{e.moves.removed.items.map((m) => m.zh).join('、')}<More n={e.moves.removed.more} /></div>
        </Group>
      )}
      {c.statChanged > 0 && (
        <Group label="三圍調整" tone="hot">
          {e.pokemon.stats.items.map((p) => <StatRow key={p.id} p={p} />)}
          <More n={e.pokemon.stats.more} />
        </Group>
      )}
      {c.typeChanged > 0 && (
        <Group label="屬性調整" tone="hot">
          {e.pokemon.types.items.map((p) => <TypeRow key={p.id} p={p} />)}
          <More n={e.pokemon.types.more} />
        </Group>
      )}
      {c.movesetChanged > 0 && (
        <Group label="招式池變動" tone="hot">
          {e.pokemon.moveset.items.map((p) => <MovesetRow key={p.id} p={p} />)}
          <More n={e.pokemon.moveset.more} />
        </Group>
      )}
      {c.pokemonAdded > 0 && (
        <Group label="新上線">
          <div className="cg-item">{e.pokemon.added.items.map((p) => p.zh).join('、')}<More n={e.pokemon.added.more} /></div>
        </Group>
      )}
      {c.pokemonRemoved > 0 && (
        <Group label="下架">
          <div className="cg-item">{e.pokemon.removed.items.map((p) => p.zh).join('、')}<More n={e.pokemon.removed.more} /></div>
        </Group>
      )}
      {ranked > 0 && (
        <Group label="排名變動">
          <div className="cg-item cg-muted">
            {Object.entries(e.rankings!.leagues).map(([cp, g]) => {
              const n = g.entered.items.length + g.left.items.length + g.moved.items.length;
              if (!n) return null;
              const top = g.moved.items[0];
              return (
                <span key={cp} className="cg-rank">
                  {LEAGUE_ZH[cp] ?? cp} {n} 筆
                  {top && `（最大 ${top.zh} #${top.from}→#${top.to}）`}
                </span>
              );
            })}
          </div>
        </Group>
      )}
    </div>
  );
}

/**
 * 資料變動日誌。
 *
 * 招式平衡調整是輸球的隱形原因，官方不會發公告；這一區就是把資料源每一版的
 * 差異攤開來，預設只顯示有影響對戰的那些。
 */
export default function ChangelogView({ log }: { log: Changelog }) {
  const [open, setOpen] = useState(false);
  const [onlyNotable, setOnlyNotable] = useState(true);

  const shown = useMemo(
    () => (onlyNotable ? log.entries.filter((e) => e.notable) : log.entries),
    [log.entries, onlyNotable]
  );
  const latest = log.entries.find((e) => e.notable);
  const notableCount = log.entries.filter((e) => e.notable).length;

  /** 收起來的時候用一句話交代最近一次有影響的變動 */
  const headline = latest
    ? [
        latest.counts.movesChanged && `招式調整 ${latest.counts.movesChanged} 項`,
        latest.counts.movesAdded && `新招式 ${latest.counts.movesAdded} 個`,
        latest.counts.movesetChanged && `招式池 ${latest.counts.movesetChanged} 隻`,
        latest.counts.statChanged && `三圍 ${latest.counts.statChanged} 隻`,
        latest.counts.typeChanged && `屬性 ${latest.counts.typeChanged} 隻`,
        latest.counts.pokemonAdded && `新上線 ${latest.counts.pokemonAdded} 隻`,
      ].filter(Boolean).join('、')
    : null;

  return (
    <section className={`cg${open ? ' open' : ''}`}>
      <button className="cg-bar" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="cg-title">資料變動</span>
        {latest ? (
          <span className="cg-sum">
            <b>{latest.date}</b> {headline}
          </span>
        ) : (
          <span className="cg-sum cg-muted">還沒有紀錄，跑 npm run changelog:backfill 可以補歷史</span>
        )}
        <span className="cg-count">{notableCount}／{log.entries.length} 版有變</span>
        <span className="cg-chev">{open ? '收合' : '展開'}</span>
      </button>

      {open && (
        <div className="cg-panel">
          <div className="cg-filter">
            {([[true, '只看影響對戰的'], [false, '全部版本']] as const).map(([v, label]) => (
              <button key={String(v)} aria-pressed={onlyNotable === v} onClick={() => setOnlyNotable(v)}>{label}</button>
            ))}
            <span className="cg-muted">資料源每次重算排名都會出一版，大多數版本其實沒動到對戰數值</span>
          </div>
          <div className="cg-list">
            {shown.map((e) => <Entry key={`${e.from}->${e.to}`} e={e} />)}
            {shown.length === 0 && <div className="cg-item cg-muted">這段期間沒有影響對戰的變動</div>}
          </div>
        </div>
      )}
    </section>
  );
}
