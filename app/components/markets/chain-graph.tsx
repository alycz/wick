"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { PricerMarket } from "@wick/shared";
import { cents } from "@/lib/format";
import { kLabel, signed, usd } from "@/lib/markets";

/* Wick's chance curve across strikes, Gemini's bid to ask as bands, BTC spot, and the edge strip below. */

function smooth(points: Array<[number, number]>): string {
  if (points.length < 2) return points.length ? `M${points[0]![0]},${points[0]![1]}` : "";
  let d = `M${points[0]![0].toFixed(1)},${points[0]![1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!; const p1 = points[i]!; const p2 = points[i + 1]!; const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]!.toFixed(1)},${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)},${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const cssPath = (d: string) => ({ d: `path("${d}")` }) as CSSProperties;

export function ChainGraph({ rows, selected, onSelect, spot, upDown }: {
  rows: PricerMarket[]; selected: PricerMarket; onSelect: (symbol: string) => void; spot: number; upDown: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const measure = () => setSize({ w: el.clientWidth - 12, h: el.clientHeight - 14 });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { w: W, h: H } = size;
  const n = rows.length;
  const L = 40; const R = 14; const T = 14; const EB = 104; const XL = 22; const B = H - XL - EB - 14;
  const stepX = (W - L - R) / Math.max(n, 1);
  const x = (i: number) => L + (i + .5) * stepX;
  const y = (p: number) => T + (1 - p) * (B - T);
  const e0 = B + 14 + EB / 2; const eS = (EB / 2 - 2) / 3;
  const pts = rows.map((row, i) => [x(i), y(row.theo)] as [number, number]);
  const curve = smooth(pts);
  let sx = L;
  for (let i = 0; i < n - 1; i += 1) if (spot >= rows[i]!.strike && spot <= rows[i + 1]!.strike) sx = x(i) + (spot - rows[i]!.strike) / (rows[i + 1]!.strike - rows[i]!.strike) * stepX;
  if (n && spot > rows[n - 1]!.strike) sx = x(n - 1);
  if (upDown) sx = x(0);
  const si = Math.max(0, rows.findIndex((row) => row.symbol === selected.symbol));
  const edge = selected.edge === undefined ? undefined : selected.edge * 100;
  const tipLeft = Math.max(8, x(si) > W * .6 ? x(si) - 200 : x(si) + 18);
  return <div className="graph" ref={box}>
    {W > 50 && n > 0 && <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Wick fair price and Gemini quotes by strike">
      <defs><linearGradient id="gArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5fd4cc" stopOpacity=".22" /><stop offset="1" stopColor="#5fd4cc" stopOpacity="0" /></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((g) => <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="#1a1f24" /><text x={L - 8} y={y(g) + 4} textAnchor="end">{g * 100}¢</text></g>)}
      <line x1={L} x2={W - R} y1={e0} y2={e0} stroke="#22282e" /><text x={L - 8} y={e0 + 4} textAnchor="end">edge</text>
      <line className="g-sel" x1={x(si)} x2={x(si)} y1={T} y2={e0 + EB / 2} />
      <path className="g-area" style={cssPath(`${curve} L${pts[n - 1]![0]},${B} L${pts[0]![0]},${B} Z`)} />
      <path className="g-curve" style={cssPath(curve)} />
      {rows.map((row, i) => {
        const bid = row.gemini.bid; const ask = row.gemini.ask;
        const quoted = bid !== undefined || ask !== undefined;
        const low = bid ?? ask ?? 0; const high = ask ?? bid ?? 0;
        const ed = row.edge === undefined ? 0 : row.edge * 100;
        const h = Math.min(EB / 2 - 2, Math.abs(ed) * eS);
        return <g key={row.symbol}>
          <rect className="g-band" x={x(i) - Math.min(7, stepX * .22)} width={Math.min(14, stepX * .44)} rx="2"
            style={{ y: y(high), height: Math.max(2, y(low) - y(high)), opacity: quoted ? 1 : 0 } as CSSProperties} />
          <rect className="g-edge" x={x(i) - Math.min(6, stepX * .2)} width={Math.min(12, stepX * .4)} rx="1.5"
            style={{ y: ed >= 0 ? e0 - h : e0, height: Math.max(.5, h), fill: Math.abs(ed) < .5 ? "#3a434b" : ed > 0 ? "var(--yes-hi)" : "var(--no-hi)" } as CSSProperties} />
          {(n <= 14 || i % 2 === 0) && <text x={x(i)} y={H - 4} textAnchor="middle">{upDown ? usd(row.strike, 0) : kLabel(row.strike)}</text>}
        </g>;
      })}
      <g className="g-spot" style={{ transform: `translateX(${sx}px)` }}><line x1="0" x2="0" y1={T - 4} y2={B} /><text className="g-spot-l" x="6" y={B - 8}>BTC</text></g>
      {rows.map((row, i) => <g key={row.symbol} className={`g-node${row.symbol === selected.symbol ? " sel" : ""}`} style={{ transform: `translate(${x(i)}px, ${y(row.theo)}px)` }}
        onClick={() => onSelect(row.symbol)}>
        <rect className="g-hit" x={-stepX / 2} y={T - y(row.theo)} width={stepX} height={e0 + EB / 2 - T} />
        <circle className="g-dot" r="4" />
      </g>)}
    </svg>}
    {W > 50 && n > 0 && <div className="g-tip" style={{ left: tipLeft }}>
      <b>{upDown ? `Up from ${usd(selected.strike)}` : `Above ${usd(selected.strike, 0)}`}</b>
      <div><span>Wick</span><span>{cents(selected.theo)}</span></div>
      <div><span>Gemini</span><span>{cents(selected.gemini.bid)} / {cents(selected.gemini.ask)}</span></div>
      <div><span>Edge</span><span className={edge === undefined || Math.abs(edge) < .5 ? "" : edge > 0 ? "up" : "down"}>{edge === undefined ? "—" : signed(edge, (v) => `${v.toFixed(1)}¢`)}</span></div>
      <div><span>Max leverage</span><span>{selected.maxLeverage}x</span></div>
    </div>}
  </div>;
}
