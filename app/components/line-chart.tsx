import type { MarketHistoryPoint } from "@wick/shared";
import type { LpPoint } from "@/lib/api";

function path(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const low = Math.min(...values); const high = Math.max(...values); const spread = high - low || 1;
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${(index / Math.max(1, values.length - 1)) * width},${height - ((value - low) / spread) * height}`).join(" ");
}

export function PriceChart({ points }: { points: MarketHistoryPoint[] }) {
  const width = 760; const height = 230;
  if (points.length < 2) return <div className="empty chart-empty">Waiting for live price history.</div>;
  const gemini = points.filter((point): point is MarketHistoryPoint & { geminiMid: number } => point.geminiMid !== undefined);
  return <svg className="line-chart" role="img" aria-label="Theo and Gemini midpoint over the last 30 minutes" viewBox={`0 0 ${width} ${height}`}>
    <path className="grid-line" d={`M0,${height / 2} L${width},${height / 2}`} />
    <path className="theo-line" d={path(points.map((point) => point.theo), width, height)} />
    {gemini.length > 1 && <path className="gemini-line" d={path(gemini.map((point) => point.geminiMid), width, height)} />}
  </svg>;
}

export function PoolChart({ points }: { points: LpPoint[] }) {
  const width = 760; const height = 220;
  if (points.length < 2) return <div className="empty chart-empty">Pool history will appear after verified on-chain events arrive.</div>;
  return <svg className="line-chart" role="img" aria-label="Liquidity pool balance over time" viewBox={`0 0 ${width} ${height}`}>
    <path className="pool-line" d={path(points.map((point) => Number(point.balanceE6) / 1_000_000), width, height)} />
  </svg>;
}
