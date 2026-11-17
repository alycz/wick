"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PositionSide } from "@wick/shared";
import { PriceChart } from "@/components/line-chart";
import { useWickActions } from "@/hooks/use-wick-actions";
import { useMarket, useMarketHistory } from "@/hooks/use-markets";
import { cents, compactAddress, dollars } from "@/lib/format";
import { tradePreview } from "@/lib/preview";

function signedDollars(value: number): string {
  return `${value >= 0 ? "+" : "−"}${dollars(Math.abs(value), 2)}`;
}

function expiryLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(timestamp);
}

export default function TradePage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol);
  const { market, loading, error } = useMarket(symbol);
  const { history, error: historyError } = useMarketHistory(symbol);
  const [side, setSide] = useState<PositionSide>("yes");
  const [margin, setMargin] = useState(100);
  const [leverage, setLeverage] = useState(1);
  const [actionError, setActionError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState<string>();
  const actions = useWickActions();
  const cappedLeverage = market ? Math.min(leverage, market.maxLeverage) : 1;
  const preview = useMemo(
    () => market ? tradePreview(market, side, margin, cappedLeverage, history) : undefined,
    [market, side, margin, cappedLeverage, history],
  );

  const submit = async () => {
    if (!actions.client || !preview || !market) {
      setActionError(actions.error ?? "Trading is not configured.");
      return;
    }
    setSubmitting(true);
    setActionError(undefined);
    setSignature(undefined);
    try {
      const result = await actions.client.openPosition({
        symbol: market.symbol,
        side,
        marginE6: BigInt(Math.round(margin * 1_000_000)),
        leverage: cappedLeverage,
        maxEntryE6: Math.min(990_000, Math.ceil(preview.entry * 1_000_000) + 1_000),
      });
      setSignature(result);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !market) return <div className="trade-loading" aria-label="Loading market" />;
  if (!market) return <div className="trade-state" role="status">{error ?? "This verified market is no longer available."}</div>;

  const distance = market.spot - market.strike;
  const canTrade = market.status === "open" && Boolean(actions.client);

  return <main className="trade-page">
    <header className="trade-market-header">
      <div className="trade-market-copy">
        <div className="trade-kicker">
          <span className={`trade-status trade-status-${market.status}`}>{market.status}</span>
          <span>{market.duration} market</span>
          <span>{market.volSource} volatility</span>
        </div>
        <h1>{market.title}</h1>
        <div className="trade-market-meta"><span>{market.symbol}</span><span>Closes {expiryLabel(market.expiryTs)}</span></div>
      </div>
      <div className="trade-spot" aria-label="Current BTC spot price">
        <span>BTC spot</span><strong>{dollars(market.spot, 2)}</strong>
        <small className={distance >= 0 ? "trade-positive" : "trade-negative"}>{signedDollars(distance)} from strike</small>
      </div>
    </header>

    {error && <div className="trade-notice" role="status">{error}</div>}

    <div className="trade-workspace">
      <section className="trade-chart-panel" aria-labelledby="trade-chart-heading">
        <div className="trade-section-head">
          <div><p className="trade-overline">Probability</p><h2 id="trade-chart-heading">Fair value</h2></div>
          <div className="trade-chart-legend" aria-label="Chart legend">
            <span><i className="trade-legend-theo" />Wick YES</span><span><i className="trade-legend-gemini" />Gemini mid</span><b>30m</b>
          </div>
        </div>
        <PriceChart points={history} />
        {historyError && <p className="trade-inline-state" role="status">{historyError}</p>}
        <div className="trade-chart-metrics">
          <div><span>YES probability</span><strong className="trade-aqua">{cents(market.theo)}</strong></div>
          <div><span>NO probability</span><strong>{cents(1 - market.theo)}</strong></div>
          <div><span>Gemini mid</span><strong>{cents(market.gemini.mid)}</strong></div>
          <div><span>Strike</span><strong>{dollars(market.strike)}</strong></div>
        </div>
      </section>

      <section className="trade-quote-panel" aria-labelledby="trade-quotes-heading">
        <div className="trade-section-head trade-section-head-compact">
          <div><p className="trade-overline">Verified feeds</p><h2 id="trade-quotes-heading">Market quotes</h2></div>
        </div>
        <div className="trade-probability-split" aria-label="Current outcome prices">
          <div><span>YES</span><strong>{cents(market.theo)}</strong></div><div><span>NO</span><strong>{cents(1 - market.theo)}</strong></div>
        </div>
        <div className="trade-quote-table">
          <div className="trade-quote-head"><span>Gemini</span><span>Probability</span></div>
          <div><span>Ask</span><strong className="trade-negative">{cents(market.gemini.ask)}</strong></div>
          <div><span>Mid</span><strong>{cents(market.gemini.mid)}</strong></div>
          <div><span>Bid</span><strong className="trade-positive">{cents(market.gemini.bid)}</strong></div>
          <div><span>Last</span><strong>{cents(market.gemini.last)}</strong></div>
        </div>
        <div className="trade-context">
          <h3>Market parameters</h3>
          <dl>
            <div><dt>Wick edge</dt><dd>{market.edge === undefined ? "—" : cents(market.edge)}</dd></div>
            <div><dt>Risk cap</dt><dd>{market.maxLeverage}×</dd></div>
            <div><dt>Spot</dt><dd>{dollars(market.spot, 2)}</dd></div>
            <div><dt>Strike distance</dt><dd className={distance >= 0 ? "trade-positive" : "trade-negative"}>{signedDollars(distance)}</dd></div>
          </dl>
        </div>
      </section>

      <aside className="trade-ticket" aria-label="Order ticket">
        <div className="trade-ticket-head">
          <div><p className="trade-overline">Open position</p><h2>Order ticket</h2></div><span className="trade-market-order">Market</span>
        </div>
        <div className="trade-side-toggle" role="group" aria-label="Choose an outcome">
          <button aria-pressed={side === "yes"} className={side === "yes" ? "trade-side-yes trade-active" : "trade-side-yes"} onClick={() => setSide("yes")} type="button"><span>YES</span><strong>{cents(market.theo)}</strong></button>
          <button aria-pressed={side === "no"} className={side === "no" ? "trade-side-no trade-active" : "trade-side-no"} onClick={() => setSide("no")} type="button"><span>NO</span><strong>{cents(1 - market.theo)}</strong></button>
        </div>
        <label className="trade-field">
          <span>Margin <small>test USDC</small></span>
          <div className="trade-input-wrap">
            <input aria-label="Margin in test USDC" min="1" step="1" type="number" value={margin} onChange={(event) => setMargin(Math.max(1, Number(event.target.value)))} />
            <b>USDC</b>
          </div>
        </label>
        <label className="trade-field trade-leverage-field">
          <span>Leverage <strong>{cappedLeverage}×</strong></span>
          <input aria-label="Leverage" min="1" max={market.maxLeverage} type="range" value={cappedLeverage} onChange={(event) => setLeverage(Number(event.target.value))} />
          <span className="trade-range-labels"><small>1×</small><small>{market.maxLeverage}× max</small></span>
        </label>
        <p className="trade-risk-note">Wick caps this market at {market.maxLeverage}× because a short BTC move can liquidate a leveraged position.</p>
        {preview && <dl className="trade-preview">
          <div><dt>Entry</dt><dd>{cents(preview.entry)}</dd></div><div><dt>Contracts</dt><dd>{preview.contracts.toFixed(2)}</dd></div>
          <div><dt>Maximum payout</dt><dd>{dollars(preview.maxPayout, 2)}</dd></div>
          <div><dt>Liquidation</dt><dd>{preview.liquidationPrice ? `${dollars(preview.liquidationPrice)} (${preview.liquidationPct?.toFixed(2)}%)` : "Awaiting sensitivity"}</dd></div>
          <div><dt>Profit fee</dt><dd>2% · up to {dollars(preview.feeAtMaxProfit, 2)}</dd></div>
        </dl>}
        <button className="trade-submit" type="button" onClick={() => void submit()} disabled={submitting || !canTrade}>
          {submitting ? "Confirming devnet transaction…" : market.status !== "open" ? `Market ${market.status}` : `Open ${side.toUpperCase()} · ${cappedLeverage}×`}
          {!submitting && market.status === "open" && <span aria-hidden="true">→</span>}
        </button>
        {!actions.client && <p className="trade-error" role="status">{actions.error ?? "Trading is not configured."}</p>}
        {actionError && <p className="trade-error" role="alert">{actionError}</p>}
        {signature && <p className="trade-success" role="status">Confirmed on devnet · {compactAddress(signature)}</p>}
        <p className="trade-ticket-foot">Devnet execution · Maximum entry includes 0.1¢ slippage protection</p>
      </aside>
    </div>
  </main>;
}
