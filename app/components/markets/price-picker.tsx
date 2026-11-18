"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PositionSide, PricerMarket } from "@wick/shared";
import { cents } from "@/lib/format";
import { kLabel, settleDensity, usd, yearsLeft } from "@/lib/markets";

/* Drag a target across Wick's forecast of where BTC settles. The strike, and the plot's domain, move on a
   critically damped spring (Stageshow style: interruptible, keeps its velocity, no overshoot). */

interface View { K: number; lo: number; hi: number }

const pct = (theo: number) => { const value = Math.round(theo * 100); return value < 1 ? "<1" : String(value); };

export function PricePicker({ rows, selected, onSelect, side, onSide, spot, sigma, expiryTs }: {
  rows: PricerMarket[];
  selected: PricerMarket;
  onSelect: (symbol: string) => void;
  side: PositionSide;
  onSide: (side: PositionSide) => void;
  spot: number;
  sigma: number;
  expiryTs: number;
}) {
  const plot = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragging, setDragging] = useState(false);
  const step = rows.length > 1 ? rows[1]!.strike - rows[0]!.strike : 1000;
  const visible = rows.filter((row) => row.theo > .015 && row.theo < .985);
  const range = visible.length >= 3 ? visible : rows;
  const target: View = {
    K: selected.strike,
    lo: Math.min(range[0]!.strike, spot, selected.strike) - step * .8,
    hi: Math.max(range[range.length - 1]!.strike, spot, selected.strike) + step * .8,
  };
  const [view, setView] = useState<View>(target);
  const motion = useRef({ cur: target, vel: { K: 0, lo: 0, hi: 0 }, raf: 0 });

  useLayoutEffect(() => {
    const box = plot.current;
    if (!box) return undefined;
    const measure = () => setSize({ w: box.clientWidth, h: box.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const m = motion.current;
    const reduced = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (dragging || reduced) { cancelAnimationFrame(m.raf); m.raf = 0; m.cur = target; m.vel = { K: 0, lo: 0, hi: 0 }; setView(target); return undefined; }
    const keys = ["K", "lo", "hi"] as const;
    const settled = () => keys.every((key) => Math.abs(m.cur[key] - target[key]) < .5 && Math.abs(m.vel[key]) < .5);
    if (settled()) return undefined;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(.032, (now - last) / 1000); last = now;
      const k = 260; const d = 2 * Math.sqrt(k);
      const next = { ...m.cur };
      for (const key of keys) { const x = m.cur[key] - target[key]; m.vel[key] += (-k * x - d * m.vel[key]) * dt; next[key] = m.cur[key] + m.vel[key] * dt; }
      m.cur = next;
      if (settled()) { m.cur = target; m.raf = 0; setView(target); return; }
      setView(next);
      m.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(m.raf);
    m.raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(m.raf); m.raf = 0; };
    // the target is derived from these values
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.K, target.lo, target.hi, dragging]);

  const pick = (clientX: number) => {
    const rect = plot.current!.getBoundingClientRect();
    const price = target.lo + (clientX - rect.left) / Math.max(rect.width, 1) * (target.hi - target.lo);
    const best = rows.reduce((a, row) => Math.abs(row.strike - price) < Math.abs(a.strike - price) ? row : a, rows[0]!);
    if (best.symbol !== selected.symbol) onSelect(best.symbol);
  };
  const index = rows.findIndex((row) => row.symbol === selected.symbol);
  const nudge = (by: number) => onSelect(rows[Math.max(0, Math.min(rows.length - 1, index + by))]!.symbol);

  const { w: W, h: H } = size;
  const AX = H - 30; const TOP = 46;
  const { K, lo, hi } = view;
  const X = (price: number) => (price - lo) / (hi - lo) * W;
  const f = settleDensity(spot, sigma, yearsLeft(expiryTs));
  const xs = Array.from({ length: 121 }, (_, i) => lo + (hi - lo) * i / 120);
  const fs = xs.map(f); const fmax = Math.max(...fs) || 1;
  const Y = (density: number) => AX - density / fmax * (AX - TOP);
  const pts = xs.map((x, i) => [X(x), Y(fs[i]!)] as const);
  const path = (list: ReadonlyArray<readonly [number, number]>) => list.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const kx = X(K); const yk = Y(f(K));
  const right = pts.filter((p) => p[0] >= kx); const left = pts.filter((p) => p[0] <= kx);
  const yesArea = right.length ? `M${kx},${AX}L${kx},${yk}${path(right).replace(/^M/, "L")}L${W},${AX}Z` : "";
  const yesLine = right.length ? `M${kx},${yk}${path(right).replace(/^M/, "L")}` : "";
  const noArea = left.length ? `M0,${AX}${path(left).replace(/^M/, "L")}L${kx},${yk}L${kx},${AX}Z` : "";
  const every = Math.ceil(rows.length / Math.max(4, Math.floor(W / 90)));
  const sx = X(spot); const flip = sx > W - 140;
  const near = rows.slice(Math.max(0, Math.min(rows.length - 7, index - 3))).slice(0, 7);

  return <div className="pk">
    <div ref={plot} className={`pk-plot${side === "no" ? " no" : ""}${dragging ? " drag" : ""}`} tabIndex={0} role="slider" aria-label="Strike price"
      aria-valuemin={rows[0]!.strike} aria-valuemax={rows[rows.length - 1]!.strike} aria-valuenow={selected.strike} aria-valuetext={`Above ${usd(selected.strike, 0)}`}
      onPointerDown={(event) => { plot.current?.setPointerCapture?.(event.pointerId); setDragging(true); pick(event.clientX); }}
      onPointerMove={(event) => { if (dragging) pick(event.clientX); }}
      onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") { event.preventDefault(); nudge(1); }
        if (event.key === "ArrowLeft") { event.preventDefault(); nudge(-1); }
      }}>
      {W > 50 && <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        <defs>
          <linearGradient id="pkYes" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5fd4cc" stopOpacity=".38" /><stop offset="1" stopColor="#5fd4cc" stopOpacity=".04" /></linearGradient>
          <linearGradient id="pkNo" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f0505d" stopOpacity=".32" /><stop offset="1" stopColor="#f0505d" stopOpacity=".04" /></linearGradient>
        </defs>
        <line x1="0" x2={W} y1={AX} y2={AX} stroke="#22282e" />
        {noArea && <path className="pk-no" d={noArea} />}
        {yesArea && <path className="pk-yes" d={yesArea} />}
        <path className="pk-curve" d={path(pts)} />
        {yesLine && <path className="pk-yes-l" d={yesLine} />}
        {rows.map((row, i) => {
          const x = X(row.strike);
          if (x < 4 || x > W - 4) return null;
          return <g key={row.symbol}>
            <line className="pk-tick" x1={x} x2={x} y1={AX} y2={AX + 6} />
            {i % every === 0 && <text x={x} y={AX + 20} textAnchor="middle">{kLabel(row.strike)}</text>}
          </g>;
        })}
        <g className="pk-spot" transform={`translate(${sx},0)`}>
          <line x1="0" x2="0" y1={TOP - 6} y2={AX} />
          <text x={flip ? -6 : 6} y={AX - 8} textAnchor={flip ? "end" : "start"}>BTC now {usd(spot, 0)}</text>
        </g>
        <g className="pk-h" style={{ transform: `translateX(${kx}px)` }}>
          <line x1="0" x2="0" y1="40" y2={AX} /><circle className="pk-knob" cx="0" cy={AX} r="7" />
        </g>
      </svg>}
      <div className="pk-tag" style={{ left: Math.max(70, Math.min(W - 70, kx)) }}>Above {usd(selected.strike, 0)}</div>
    </div>
    <div className="pk-ans">
      <div className="pk-nav">
        <div className="pk-big">{pct(selected.theo)}<small>%</small></div>
        <div className="pk-step">
          <button type="button" aria-label="Lower strike" onClick={() => nudge(-1)}>‹</button>
          <button type="button" aria-label="Higher strike" onClick={() => nudge(1)}>›</button>
        </div>
      </div>
      <div className="pk-txt">chance BTC ends above<b>{usd(selected.strike, 0)}</b></div>
      <div className="yn">
        <button type="button" className={`by${side === "yes" ? " on" : ""}`} onClick={() => onSide("yes")}>Yes {cents(selected.theo)}</button>
        <button type="button" className={`bn${side === "no" ? " on" : ""}`} onClick={() => onSide("no")}>No {cents(1 - selected.theo)}</button>
      </div>
    </div>
    <div className="pk-near">
      {near.map((row) => <button type="button" key={row.symbol} aria-pressed={row.symbol === selected.symbol} onClick={() => onSelect(row.symbol)}>
        <b>{usd(row.strike, 0)}</b><span>{pct(row.theo)}%</span>
      </button>)}
    </div>
  </div>;
}
