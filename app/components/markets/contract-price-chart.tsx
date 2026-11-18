"use client";

import { useMemo, useState } from "react";
import type { MarketHistoryPoint, PositionSide, PricerMarket } from "@wick/shared";
import { WickChart, type ChartPoint, type ChartSeries, type ChartWindow } from "@/components/wick-chart";
import { usePriceTrail } from "@/hooks/use-price-trail";
import { cents } from "@/lib/format";
import { usd, validQuote } from "@/lib/markets";
import { Seg } from "./controls";

const seconds = (ms: number) => Math.floor(ms / 1_000);
const WICK = "#5fd4cc";
const BID = "#9aa8ff";
const ASK = "#e6a474";
type PriceView = "price" | "spot";
type PriceKey = "theo" | "geminiBid" | "geminiAsk" | "geminiMid";
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
  const { symbol, openTs, expiryTs, gemini, duration } = market;
  const upDown = market.kind === "up_down";
  const seeds = useMemo(() => {
    const quoteKeys = ["geminiBid", "geminiAsk", "geminiMid"] as const;
    const data: Record<PriceKey, ChartPoint[]> = { theo: [], geminiBid: [], geminiAsk: [], geminiMid: [] };
    for (const row of history) {
      if ((upDown && row.ts < openTs) || row.ts >= expiryTs) continue;
      data.theo.push({ time: seconds(row.ts), value: row.theo });
      if (!validQuote(row.geminiBid, row.geminiAsk, row.geminiMid)) continue;
      for (const key of quoteKeys) {
        const point = at(row.ts, row[key]);
        if (point) data[key].push(point);
      }
    }
    return data;
  }, [history, openTs, expiryTs, upDown]);
  const liveAt = observedAt !== undefined && observedAt >= openTs && observedAt < expiryTs ? observedAt : undefined;
  const quoteAt = liveAt !== undefined && validQuote(gemini.bid, gemini.ask, gemini.mid) && gemini.ts >= openTs && gemini.ts < expiryTs
    && liveAt - gemini.ts >= -5_000 && liveAt - gemini.ts <= 30_000 ? gemini.ts : undefined;
  const theo = usePriceTrail(symbol, seeds.theo, at(liveAt, market.theo));
  const yesBid = usePriceTrail(symbol, seeds.geminiBid, at(quoteAt, gemini.bid));
  const yesAsk = usePriceTrail(symbol, seeds.geminiAsk, at(quoteAt, gemini.ask));
  const mid = usePriceTrail(symbol, seeds.geminiMid, at(quoteAt, gemini.mid));
  const up = side === "yes";
  const price = (value: number | undefined) => value === undefined ? undefined : up ? value : 1 - value;
  const transform = (points: ChartPoint[]) => up ? points : points.map(({ value, ...point }) => ({ ...point, value: 1 - value }));
  const series: ChartSeries[] = [
    { id: "theo", label: "Wick fair price", color: WICK, data: transform(theo) },
    { id: "bid", label: "Gemini bid", color: BID, data: transform(up ? yesBid : yesAsk) },
    { id: "ask", label: "Gemini ask", color: ASK, data: transform(up ? yesAsk : yesBid) },
  ];
  if (!yesBid.length && !yesAsk.length && mid.length) {
    series.push({ id: "mid", label: "Gemini midpoint", color: BID, data: transform(mid) });
  }
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

  return <section className={className} aria-label={upDown ? "Up/Down chart" : "Strike price chart"}>
    {!upDown && <div className="ud-chart-heading">
      <h2>BTC above {usd(market.strike, 0)}</h2>
      <label>Strike
        <select value={symbol} onChange={(event) => onStrikeChange(event.target.value)}>
          {strikes.map((strike) => <option key={strike.symbol} value={strike.symbol}>{usd(strike.strike, 0)}</option>)}
        </select>
      </label>
    </div>}
    <div className="ud-chart-header">
      <Seg className="wc-tabs" buttonClass="wc-tab" label="Price chart view" value={view} onChange={setView}
        options={[{ value: "price", label: "Contract price" }, { value: "spot", label: "BTC spot" }]} />
      {view === "price" && <Seg className="wc-tabs" buttonClass="wc-tab" label="Chart side" value={side} onChange={setSide}
        options={[{ value: "yes", label: positive }, { value: "no", label: negative }]} />}
    </div>
    {view === "price" ? <>
      <div className="ud-chart-prices" aria-label={`${up ? positive : negative} contract prices`}>
        <span><i style={{ background: WICK }} />Wick fair price <b>{cents(price(market.theo))}</b></span>
        <span><i style={{ background: BID }} />Gemini bid <b>{cents(quoteAt === undefined ? undefined : price(up ? gemini.bid : gemini.ask))}</b></span>
        <span><i style={{ background: ASK }} />Gemini ask <b>{cents(quoteAt === undefined ? undefined : price(up ? gemini.ask : gemini.bid))}</b></span>
      </div>
      {historyError && <p className="mk-notice" role="status">Recorded prices are temporarily unavailable.</p>}
      {history.some((point) => point.reconstructed) && <p className="ud-chart-source">Early Wick prices reconstructed from saved Deribit options.</p>}
      <WickChart key={symbol} series={series.filter((line) => line.id === "theo" || line.data.length > 0)}
        format="cents" windows={windows} followFullWindow={!upDown} initialWindow={span} height={height} {...(!upDown ? { formatTime: dateAndTime } : {})} />
    </> : <WickChart key={`${symbol}:spot`} series={[{ id: "btc", label: "BTC", color: "#f7931a", data: spotTrail }]}
      format="usd" windows={windows} followFullWindow={!upDown} initialWindow={span} height={height}
      refLine={{ value: market.strike, label: upDown ? "Target" : "Strike" }} {...(!upDown ? { formatTime: dateAndTime } : {})} />}
  </section>;
}
