'use client';

import { useId } from 'react';
import { band, RADAR_AXES, radarPercent, type RadarContext, type RadarValues } from '@/lib/analysis';

// 畫布比正方形寬，因為左右兩邊的軸標籤比上下的長，擠成正方形會被切掉；
// 右邊那一軸（耐久）底下還多一行「防 × HP」，所以留得更寬
const W = 360;
const H = 236;
const CX = W / 2;
const CY = 116;
/** 外圈半徑。剩下的空間留給軸標籤 */
const R = 76;
const LABEL_R = 100;
const RINGS = [0.25, 0.5, 0.75, 1];

/** 第 i 個軸、距中心 d 的座標。從正上方開始、順時針平分一圈 */
function point(i: number, d: number): [number, number] {
  const a = (-90 + i * (360 / RADAR_AXES.length)) * (Math.PI / 180);
  return [CX + Math.cos(a) * d, CY + Math.sin(a) * d];
}

const path = (ds: number[]) =>
  ds.map((d, i) => `${i ? 'L' : 'M'}${point(i, d).map((n) => n.toFixed(1)).join(' ')}`).join(' ') + ' Z';

/**
 * 能力雷達圖：攻擊／耐久 ＋ 出手三項（爆發／充能／快攻）。
 *
 * 畫的是**百分位**不是原始值——五個軸的單位不同，攻擊 120 跟 DPE 2.0 沒得比，
 * 只有「贏過同聯盟多少人」放得進同一張圖。
 *
 * 配色：底色是灰的（形狀本身不帶訊息），訊息在頂點與數字上——
 * 每個頂點塗它自己那一段的顏色，跟軸上的數字同色；
 * 每一段連線是「從這個頂點的顏色漸層到下一個頂點的顏色」，
 * 所以線本身也在講兩端的強弱，而不是一條裝飾用的固定漸層。
 *
 * @param values 這一隻的軸值
 * @param ctx 同聯盟上榜那一批的分布，用來換算百分位
 * @param compare 另一隻的軸值，有的話疊一層虛線上去比形狀
 */
export default function Radar({ values, ctx, compare }: {
  values: RadarValues;
  ctx: RadarContext;
  compare?: RadarValues | null;
}) {
  // 同一頁可能有兩張卡，漸層的 id 不能撞
  const gid = `rg${useId().replace(/:/g, '')}`;
  const pcts = RADAR_AXES.map((a) => radarPercent(ctx, a.key, values[a.key]));
  const mine = pcts.map((p) => (p / 100) * R);
  const theirs = compare
    ? RADAR_AXES.map((a) => (radarPercent(ctx, a.key, compare[a.key]) / 100) * R)
    : null;
  const pts = mine.map((d, i) => point(i, d));
  /** 每一段連線的兩端與它們各自的顏色 */
  const segs = pts.map((a, i) => {
    const j = (i + 1) % pts.length;
    return { id: `${gid}s${i}`, a, b: pts[j], from: band(pcts[i]), to: band(pcts[j]) };
  });

  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="五項能力的百分位雷達圖">
      <defs>
        {/* 一段一個漸層，座標直接用畫布座標，兩端就是那兩個頂點的顏色 */}
        {segs.map((sg) => (
          <linearGradient
            key={sg.id}
            id={sg.id}
            gradientUnits="userSpaceOnUse"
            x1={sg.a[0]} y1={sg.a[1]} x2={sg.b[0]} y2={sg.b[1]}
          >
            <stop offset="0%" stopColor={`var(--b${sg.from})`} />
            <stop offset="100%" stopColor={`var(--b${sg.to})`} />
          </linearGradient>
        ))}
      </defs>

      {RINGS.map((f) => (
        <polygon
          key={f}
          className={f === 1 ? 'ring edge' : 'ring'}
          points={RADAR_AXES.map((_, i) => point(i, R * f).join(',')).join(' ')}
        />
      ))}
      {RADAR_AXES.map((a, i) => (
        <line key={a.key} className="spoke" x1={CX} y1={CY} x2={point(i, R)[0]} y2={point(i, R)[1]} />
      ))}

      {theirs && <path className="shape other" d={path(theirs)} />}
      <path className="shape mine" d={path(mine)} />
      {segs.map((sg) => (
        <line
          key={sg.id}
          className="seg"
          x1={sg.a[0]} y1={sg.a[1]} x2={sg.b[0]} y2={sg.b[1]}
          stroke={`url(#${sg.id})`}
        />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={i} className={`dot vb${band(pcts[i])}`} cx={x} cy={y} r={3.2} />
      ))}

      {/* 標籤上寫的是真實數值，顏色是它在同聯盟的強弱段——
          數字回答「多少」、顏色回答「算強還算弱」，位置回答「贏過多少人」 */}
      {RADAR_AXES.map((a, i) => {
        const [x, y] = point(i, LABEL_R);
        const [cx] = point(i, 1);
        const anchor = Math.abs(cx - CX) < 0.2 ? 'middle' : cx > CX ? 'start' : 'end';
        return (
          <text key={a.key} className="lbl" x={x} y={y} textAnchor={anchor}>
            <title>{`${a.label}：${a.hint}　${a.fmt(values[a.key])}，贏過同聯盟 ${Math.round(pcts[i])}%`}</title>
            <tspan x={x} dy="-4">{a.label}</tspan>
            <tspan className={`val vb${band(pcts[i])}`} x={x} dy="15">{a.fmt(values[a.key])}</tspan>
            <tspan className="pct" dx="4">{Math.round(pcts[i])}%</tspan>
            {a.sub && <tspan className="sub" x={x} dy="12">{a.sub(values)}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}
