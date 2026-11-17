"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PricerMarket } from "@wick/shared";
import { useHealth, useMarkets } from "@/hooks/use-markets";
import { cents, dollars, durationCountdown } from "@/lib/format";

const LIVE_MARK_MAX_AGE_MS = 10_000;
const LIVE_QUOTE_MAX_AGE_MS = 30_000;

const tabs = [
  ["Hourly", "1h"], ["Daily", "1d"], ["Weekly", "1w"], ["Month-end", "month-end"],
] as const;

function Quote({ market }: { market: PricerMarket }) {
  return <span className="quote"><b>{market.gemini.bid === undefined ? "no bid" : cents(market.gemini.bid)}</b><i>/</i><b>{market.gemini.ask === undefined ? "no ask" : cents(market.gemini.ask)}</b></span>;
}

export default function MarketsPage() {
  const { markets, loading, error } = useMarkets();
  const { health, error: healthError } = useHealth();
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState("1h");
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  const hero = useMemo(() => markets.filter((market) => market.duration === "15m" && market.status === "open").sort((a, b) => a.expiryTs - b.expiryTs)[0], [markets]);
  const ladder = markets.filter((market) => market.kind === "ladder" && market.duration === duration).sort((a, b) => a.strike - b.strike);
  const quoteAgeMs = hero ? now - hero.gemini.ts : undefined;
  const live = Boolean(
    hero && !error && health?.ok && health.chainConfigured && health.volHealthy
      && health.markAgeMs !== undefined && health.markAgeMs <= LIVE_MARK_MAX_AGE_MS
      && quoteAgeMs !== undefined && quoteAgeMs >= 0 && quoteAgeMs <= LIVE_QUOTE_MAX_AGE_MS,
  );
  const heroStatus = live ? "Live BTC" : loading && !hero ? "Loading BTC" : hero ? "Stale BTC" : "BTC unavailable";

  return <div className="page-stack">
    <section className="page-intro">
      <p className="eyebrow">OPTIONS-IMPLIED PREDICTION MARKETS · SOLANA DEVNET</p>
      <h1>Every Gemini strike,<br /><em>at fair value.</em></h1>
      <p>Tail markets priced from the BTC options surface. Self-bootstrapping liquidity. Risk-capped leverage per strike.</p>
    </section>
    <div className="notice system-status" role="status">
      <span className={`live-dot ${health?.ok ? "connected" : ""}`} />
      {health ? `Pricing ${health.ok ? "online" : "degraded"} · ${health.volSource} volatility · chain ${health.chainConfigured ? "configured" : "not configured"}` : healthError ?? "Checking backend health…"}
    </div>
    {error && <div className="notice" role="status">{error}</div>}
    <section className="hero-market panel" aria-labelledby="hero-title">
      <div className="section-heading"><div><span className={`live-dot ${live ? "connected" : ""}`} /> {heroStatus} · 15 minute</div>{hero && <span className="badge">{hero.volSource} vol</span>}</div>
      {loading && !hero ? <div className="skeleton-block" /> : hero ? <>
        <div className="hero-main">
          <div><span className="muted">Reference strike</span><strong className="hero-number">{dollars(hero.strike, 2)}</strong><small>BTC spot {dollars(hero.spot, 2)}</small></div>
          <div className="countdown"><span>WINDOW CLOSES IN</span><strong>{durationCountdown(hero.expiryTs, now)}</strong></div>
        </div>
        <div className="metric-grid">
          <div><span>Wick theo YES</span><b className="amber">{cents(hero.theo)}</b></div>
          <div><span>Gemini bid / ask</span><Quote market={hero} /></div>
          <div><span>Edge vs mid</span><b className={(hero.edge ?? 0) >= 0 ? "positive" : "negative"}>{hero.edge === undefined ? "—" : `${(hero.edge * 100).toFixed(1)}¢`}</b></div>
          <div><span>Risk cap</span><b>{hero.maxLeverage}×</b></div>
        </div>
        <Link className="trade-cta" href={`/m/${encodeURIComponent(hero.symbol)}`}>Trade live market <span>→</span></Link>
      </> : <div className="empty">No verified live BTC 15-minute market is available yet.</div>}
    </section>
    <section className="panel ladder-panel">
      <div className="section-heading"><div>Tail ladder</div><span className="muted">Strikes within ±10% of spot</span></div>
      <div className="tabs" role="tablist" aria-label="Market duration">
        {tabs.map(([label, value]) => <button type="button" role="tab" aria-selected={duration === value} className={duration === value ? "active" : ""} key={value} onClick={() => setDuration(value)}>{label}</button>)}
      </div>
      <div className="market-table" role="table" aria-label={`${duration} BTC strike ladder`}>
        <div className="table-row table-head" role="row"><span>Strike</span><span>From spot</span><span>Theo YES</span><span>Gemini bid / ask</span><span>Edge</span><span>Max</span><span /></div>
        {ladder.length === 0 && <div className="empty">No live {tabs.find((tab) => tab[1] === duration)?.[0].toLowerCase()} ladder is available.</div>}
        {ladder.map((market) => <div className="table-row" role="row" key={market.symbol}>
          <strong>{dollars(market.strike)}</strong><span>{((market.strike / market.spot - 1) * 100).toFixed(1)}%</span>
          <b className="amber">{cents(market.theo)}</b><Quote market={market} />
          <b className={(market.edge ?? 0) >= 0 ? "positive" : "negative"}>{market.edge === undefined ? "—" : `${(market.edge * 100).toFixed(1)}¢`}</b>
          <span>{market.maxLeverage}×</span><Link className="row-trade" href={`/m/${encodeURIComponent(market.symbol)}`}>Trade</Link>
        </div>)}
      </div>
    </section>
  </div>;
}
