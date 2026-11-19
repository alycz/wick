"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { MarketHistoryPoint, PositionSide, PricerMarket } from "@wick/shared";
import { WickChart, type ChartMode, type ChartPoint, type ChartSeries, type ChartWindow } from "@/components/wick-chart";
import { usePriceTrail } from "@/hooks/use-price-trail";
import { cents } from "@/lib/format";
import { usd } from "@/lib/markets";
import { Seg } from "./controls";
import { Dropdown } from "@/components/ui/dropdown";

const seconds = (ms: number) => Math.floor(ms / 1_000);
const WICK = "#5fd4cc";
type PriceView = "price" | "spot";
const DAY = 86_400;
const dateAndTime = (time: number) => new Date(time * 1_000).toLocaleString("en-US", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

function at(time: number | undefined, value: number | undefined): ChartPoint | undefined {
  return time === undefined || value === undefined ? undefined : { time: seconds(time), value };
}

export function ContractPriceChart({ market, strikes, onStrikeChange, history, spotTrail, observedAt, historyError, height, className }: {
  market: PricerMarket;
  strikes: PricerMarket[];
  onStrikeChange: (symbol: string) => void;
  history: MarketHistoryPoint[];
  spotTrail: ChartPoint[];
  observedAt?: number | undefined;
  historyError?: string | undefined;
  height: number;
  className: string;
}) {
  const [view, setView] = useState<PriceView>("price");
  const [side, setSide] = useState<PositionSide>("yes");
  const { symbol, openTs, expiryTs, duration } = market;
  const upDown = market.kind === "up_down";
  const historyPoints = useMemo(() => history
    .filter((row) => (!upDown || row.ts >= openTs) && row.ts < expiryTs)
    .map((row) => ({ time: seconds(row.ts), value: row.theo })), [history, openTs, expiryTs, upDown]);
  const liveAt = observedAt !== undefined && observedAt >= openTs && observedAt < expiryTs ? observedAt : undefined;
  const theo = usePriceTrail(symbol, historyPoints, at(liveAt, market.theo));
  const up = side === "yes";
  const series: ChartSeries[] = [{
    id: "theo", label: "Wick fair price", color: WICK,
    data: up ? theo : theo.map(({ time, value }) => ({ time, value: 1 - value })),
  }];
  const rightEdge = Math.max(theo.at(-1)?.time ?? 0, seconds(Date.now()));
  const firstPrice = history[0];
  const span = upDown ? duration === "5m" ? 300 : 900
    : Math.max(60, firstPrice ? rightEdge - seconds(firstPrice.ts) + 60 : 3_600);
  const windows: ChartWindow[] = upDown
    ? [{ label: "1m", secs: 60 }, ...(span > 300 ? [{ label: "5m", secs: 300 }] : []), { label: "Full window", secs: span }]
    : [...[{ label: "1h", secs: 3_600 }, { label: "6h", secs: 21_600 }, { label: "1d", secs: DAY }].filter((item) => span > item.secs),
      { label: "All", secs: span }];
  const positive = upDown ? "Up" : "Yes";
  const negative = upDown ? "Down" : "No";

  const [mode, setMode] = useState<ChartMode>("live");
  const timeNote = <small className="ud-chart-utc">{mode === "tv" ? "Chart times in UTC" : "Chart times in your time zone"}</small>;
  /* row one: chart view on the left; side, range and chart type on the right. Row two: time note left, live price right */
  const header = (price: ReactNode) => function ChartHeader(controls: { windows: ReactNode; type: ReactNode }) { return <>
    <div className="ud-chart-header">
      <Seg className="wc-tabs" buttonClass="wc-tab" label="Price chart view" value={view} onChange={setView}
        options={[{ value: "price", label: "Contract price" }, { value: "spot", label: "BTC spot" }]} />
      <div className="ud-chart-ctl">
        {view === "price" && <Seg className="wc-tabs" buttonClass="wc-tab" label="Chart side" value={side} onChange={setSide}
          options={[{ value: "yes", label: positive }, { value: "no", label: negative }]} />}
        {controls.windows}
        {controls.type}
      </div>
    </div>
    <div className="ud-chart-prices">{timeNote}{price}</div>
  </>; };

  return <section className={className} aria-label={upDown ? "Up/Down chart" : "Strike price chart"}>
    {!upDown && <div className="ud-chart-heading">
      <h2>BTC above {usd(market.strike, 0)}</h2>
      <Dropdown label="Strike" prefix="Strike" align="right" value={symbol} onChange={onStrikeChange}
        options={strikes.map((strike) => ({ value: strike.symbol, label: usd(strike.strike, 0), hint: `${Math.round(strike.theo * 100)}%` }))} />
    </div>}
    {historyError && view === "price" && <p className="mk-notice" role="status">Recorded prices are temporarily unavailable.</p>}
    {view === "price" && history.some((point) => point.reconstructed) && <p className="ud-chart-source">Early Wick prices reconstructed from saved Deribit options.</p>}
    {view === "price"
      ? <WickChart key={symbol} series={series} mode={mode} onMode={setMode}
        header={header(<span aria-label={`${up ? positive : negative} contract prices`}><i style={{ background: WICK }} />Wick fair price <b>{cents(up ? market.theo : 1 - market.theo)}</b></span>)}
        format="cents" windows={windows} followFullWindow={!upDown} initialWindow={span} height={height} {...(!upDown ? { formatTime: dateAndTime } : {})} />
      : <WickChart key={`${symbol}:spot`} series={[{ id: "btc", label: "BTC", color: "#f7931a", data: spotTrail }]} mode={mode} onMode={setMode}
        header={header(<span><i style={{ background: "#f7931a" }} />BTC spot <b>{usd(spotTrail.at(-1)?.value ?? market.spot)}</b></span>)}
        format="usd" windows={windows} followFullWindow={!upDown} initialWindow={span} height={height}
        refLine={{ value: market.strike, label: upDown ? "Target" : "Strike" }} {...(!upDown ? { formatTime: dateAndTime } : {})} />}
  </section>;
}
