import type { MarketHistoryPoint } from "@wick/shared";
import type { LpPoint } from "@/lib/api";

function path(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const low = Math.min(...values); const high = Math.max(...values); const spread = high - low || 1;
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${(index / Math.max(1, values.length - 1)) * width},${height - ((value - low) / spread) * height}`).join(" ");
}

function probabilityPath(points: MarketHistoryPoint[], value: (point: MarketHistoryPoint) => number | undefined, width: number, height: number, low: number, high: number): string {
  const left = 4; const right = 48; const top = 12; const bottom = 22;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom; const spread = high - low || 1;
  return points.reduce<string>((result, point, index) => {
    const current = value(point);
    if (current === undefined || !Number.isFinite(current)) return result;
    const x = left + (index / Math.max(1, points.length - 1)) * plotWidth;
    const y = top + (1 - (current - low) / spread) * plotHeight;
    return `${result}${result ? " L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
  }, "");
}

export function PriceChart({ points }: { points: MarketHistoryPoint[] }) {
  const width = 780; const height = 300;
  if (points.length < 2) return <div className="trade-chart-empty">Waiting for live price history.</div>;
  const values = points.flatMap((point) => point.geminiMid === undefined ? [point.theo] : [point.theo, point.geminiMid]);
  const rawLow = Math.min(...values); const rawHigh = Math.max(...values); const padding = Math.max((rawHigh - rawLow) * .12, .01);
  const low = Math.max(0, rawLow - padding); const high = Math.min(1, rawHigh + padding);
  const levels = [0, .25, .5, .75, 1].map((step) => high - (high - low) * step);
  const theoPath = probabilityPath(points, (point) => point.theo, width, height, low, high);
  const geminiPath = probabilityPath(points, (point) => point.geminiMid, width, height, low, high);
  return <svg className="trade-chart" role="img" aria-label="Wick YES probability and Gemini midpoint over the last 30 minutes" viewBox={`0 0 ${width} ${height}`}>
    <defs><linearGradient id="trade-theo-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--aqua)" stopOpacity="0.22" /><stop offset="1" stopColor="var(--aqua)" stopOpacity="0" /></linearGradient></defs>
    {levels.map((level, index) => { const y = 12 + index * ((height - 34) / 4); return <g key={level}><path className="trade-chart-grid" d={`M4,${y} L732,${y}`} /><text className="trade-chart-label" x="772" y={y + 4} textAnchor="end">{(level * 100).toFixed(0)}¢</text></g>; })}
    {theoPath && <path className="trade-chart-area" d={`${theoPath} L732,278 L4,278 Z`} />}
    <path className="trade-chart-theo" d={theoPath} />
    {geminiPath && <path className="trade-chart-gemini" d={geminiPath} />}
    <text className="trade-chart-time" x="4" y="296">30m ago</text><text className="trade-chart-time" x="732" y="296" textAnchor="end">Now</text>
  </svg>;
}

export function PoolChart({ points }: { points: LpPoint[] }) {
  const width = 760; const height = 220;
  if (points.length < 2) return <div className="empty chart-empty">Pool history will appear after verified on-chain events arrive.</div>;
  return <svg className="line-chart" role="img" aria-label="Liquidity pool balance over time" viewBox={`0 0 ${width} ${height}`}><path className="pool-line" d={path(points.map((point) => Number(point.balanceE6) / 1_000_000), width, height)} /></svg>;
}
