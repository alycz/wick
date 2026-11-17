"use client";

import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { PositionSide } from "@wick/shared";
import { PriceChart } from "@/components/line-chart";
import { useWickActions } from "@/hooks/use-wick-actions";
import { useMarket, useMarketHistory } from "@/hooks/use-markets";
import { cents, compactAddress, dollars } from "@/lib/format";
import { tradePreview } from "@/lib/preview";

export default function TradePage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol);
  const { market, loading, error } = useMarket(symbol);
  const { history } = useMarketHistory(symbol);
  const [side, setSide] = useState<PositionSide>("yes");
  const [margin, setMargin] = useState(100);
  const [leverage, setLeverage] = useState(1);
  const [actionError, setActionError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState<string>();
  const actions = useWickActions();
  const cappedLeverage = market ? Math.min(leverage, market.maxLeverage) : 1;
  const preview = useMemo(() => market ? tradePreview(market, side, margin, cappedLeverage, history) : undefined, [market, side, margin, cappedLeverage, history]);
  const submit = async () => {
    if (!actions.client || !preview || !market) { setActionError(actions.error ?? "Trading is not configured."); return; }
    setSubmitting(true); setActionError(undefined); setSignature(undefined);
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
    } finally { setSubmitting(false); }
  };

  if (loading && !market) return <div className="panel skeleton-block" />;
  if (!market) return <div className="page-stack"><div className="notice">{error ?? "This verified market is no longer available."}</div></div>;
  return <div className="page-stack trade-page">
    <div className="trade-title"><div><p className="eyebrow">{market.duration} · {market.status}</p><h1>{market.title}</h1><p>{market.symbol}</p></div><div className="spot-block"><span>BTC SPOT</span><b>{dollars(market.spot, 2)}</b></div></div>
    <div className="trade-grid">
      <section className="panel chart-panel">
        <div className="section-heading"><div>Fair value vs Gemini</div><div className="legend"><i className="theo-key" /> Wick theo <i className="gemini-key" /> Gemini mid</div></div>
        <PriceChart points={history} />
        <div className="metric-grid compact-metrics"><div><span>Theo YES</span><b className="amber">{cents(market.theo)}</b></div><div><span>Gemini mid</span><b>{cents(market.gemini.mid)}</b></div><div><span>Strike</span><b>{dollars(market.strike)}</b></div><div><span>Risk cap</span><b>{market.maxLeverage}×</b></div></div>
      </section>
      <section className="panel order-ticket" aria-label="Order ticket">
        <div className="side-toggle"><button className={side === "yes" ? "yes active" : "yes"} onClick={() => setSide("yes")} type="button">YES <b>{cents(market.theo)}</b></button><button className={side === "no" ? "no active" : "no"} onClick={() => setSide("no")} type="button">NO <b>{cents(1 - market.theo)}</b></button></div>
        <label>Margin <span>test USDC</span><input min="1" step="1" type="number" value={margin} onChange={(event) => setMargin(Math.max(1, Number(event.target.value)))} /></label>
        <label>Leverage <span>{cappedLeverage}× / {market.maxLeverage}× cap</span><input aria-label="Leverage" min="1" max={market.maxLeverage} type="range" value={cappedLeverage} onChange={(event) => setLeverage(Number(event.target.value))} /></label>
        <p className="risk-note" title={`Risk cap ${market.maxLeverage}x (global 1000x): above this, an ordinary few-second BTC move could liquidate you`}>Risk cap {market.maxLeverage}x (global 1000x): above this, an ordinary few-second BTC move could liquidate you.</p>
        {preview && <dl className="preview-list"><div><dt>Entry</dt><dd>{cents(preview.entry)}</dd></div><div><dt>Contracts</dt><dd>{preview.contracts.toFixed(2)}</dd></div><div><dt>Max payout</dt><dd>{dollars(preview.maxPayout, 2)}</dd></div><div><dt>Liquidation</dt><dd>{preview.liquidationPrice ? `${dollars(preview.liquidationPrice)} (${preview.liquidationPct?.toFixed(2)}%)` : "Awaiting price sensitivity"}</dd></div><div><dt>Profit fee</dt><dd>2% · up to {dollars(preview.feeAtMaxProfit, 2)}</dd></div></dl>}
        <button className="trade-cta button-reset" type="button" onClick={() => void submit()} disabled={submitting || market.status !== "open" || !actions.client}>{submitting ? "Confirming devnet transaction…" : `Open ${side.toUpperCase()} at ${cappedLeverage}×`} <span>→</span></button>
        {!actions.client && <p className="form-error" role="status">{actions.error ?? "Trading is not configured."}</p>}
        {actionError && <p className="form-error" role="alert">{actionError}</p>}
        {signature && <p className="wallet-message" role="status">Confirmed on devnet · {compactAddress(signature)}</p>}
      </section>
    </div>
  </div>;
}
