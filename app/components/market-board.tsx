"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PricerMarket } from "@wick/shared";
import { useHealth, useMarkets } from "@/hooks/use-markets";
import { cents, dollars, durationCountdown } from "@/lib/format";

const LIVE_MARK_MAX_AGE_MS = 10_000;
const LIVE_QUOTE_MAX_AGE_MS = 30_000;

const tabs = [
  ["Hourly", "1h"],
  ["Daily", "1d"],
  ["Weekly", "1w"],
  ["Month-end", "month-end"],
] as const;

function Quote({ market }: { market: PricerMarket }) {
  return <span className="markets-quote">
    <b>{market.gemini.bid === undefined ? "no bid" : cents(market.gemini.bid)}</b>
    <i>/</i>
    <b>{market.gemini.ask === undefined ? "no ask" : cents(market.gemini.ask)}</b>
  </span>;
}

export function MarketBoard() {
  const { markets, loading, error } = useMarkets();
  const { health, error: healthError } = useHealth();
  const [now, setNow] = useState(Date.now());
  const [duration, setDuration] = useState("1h");

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const hero = useMemo(
    () => markets
      .filter((market) => market.duration === "15m" && market.status === "open")
      .sort((a, b) => a.expiryTs - b.expiryTs)[0],
    [markets],
  );
  const ladder = markets
    .filter((market) => market.kind === "ladder" && market.duration === duration)
    .sort((a, b) => a.strike - b.strike);
  const quoteAgeMs = hero ? now - hero.gemini.ts : undefined;
  const live = Boolean(
    hero && !error && health?.ok && health.chainConfigured && health.volHealthy
      && health.markAgeMs !== undefined && health.markAgeMs <= LIVE_MARK_MAX_AGE_MS
      && quoteAgeMs !== undefined && quoteAgeMs >= 0 && quoteAgeMs <= LIVE_QUOTE_MAX_AGE_MS,
  );
  const heroStatus = live
    ? "Live BTC"
    : loading && !hero
      ? "Loading BTC"
      : hero
        ? "Stale BTC"
        : "BTC unavailable";
  const healthLabel = health
    ? `Pricing ${health.ok ? "online" : "degraded"} · ${health.volSource} volatility · chain ${health.chainConfigured ? "configured" : "not configured"}`
    : healthError ?? "Checking backend health…";

  return <div className="markets-page">
    <header className="markets-heading">
      <div>
        <p className="markets-eyebrow">MARKET TERMINAL</p>
        <h1>BTC prediction markets</h1>
      </div>
      <div className={`markets-health ${health?.ok ? "markets-health-online" : ""}`} role="status">
        <i />
        <span>{healthLabel}</span>
      </div>
    </header>

    {error && <div className="markets-notice" role="status">{error}</div>}

    <section className="markets-terminal" aria-labelledby="markets-hero-title">
      <div className="markets-terminal-head">
        <div>
          <span className={`markets-live-dot ${live ? "markets-live-dot-online" : ""}`} />
          <strong>{heroStatus}</strong>
          <span>15 minute window</span>
        </div>
        <div>{hero ? <span className="markets-source">{hero.volSource} vol source</span> : <span className="markets-source">awaiting source</span>}</div>
      </div>

      {loading && !hero ? <div className="markets-skeleton" aria-label="Loading market" /> : hero ? <>
        <div className="markets-workspace">
          <div className="markets-market-card">
            <div className="markets-card-label">CURRENT CONTRACT</div>
            <h2 id="markets-hero-title">BTC closes above the captured strike?</h2>
            <div className="markets-strike-row">
              <div><span>Reference strike</span><strong>{dollars(hero.strike, 2)}</strong></div>
              <div><span>BTC spot</span><b>{dollars(hero.spot, 2)}</b></div>
            </div>
            <div className="markets-window">
              <span>WINDOW CLOSES IN</span>
              <strong>{durationCountdown(hero.expiryTs, now)}</strong>
            </div>
          </div>

          <div className="markets-signal-card">
            <div className="markets-card-label">PRICE DISCOVERY</div>
            <div className="markets-signal-primary">
              <span>Wick theo YES</span>
              <strong>{cents(hero.theo)}</strong>
              <small>Options-implied reference</small>
            </div>
            <div className="markets-signal-row"><span>Gemini bid / ask</span><Quote market={hero} /></div>
            <div className="markets-signal-row">
              <span>Edge vs mid</span>
              <b className={(hero.edge ?? 0) >= 0 ? "markets-positive" : "markets-negative"}>
                {hero.edge === undefined ? "—" : `${(hero.edge * 100).toFixed(1)}¢`}
              </b>
            </div>
          </div>

          <aside className="markets-action-card">
            <div className="markets-card-label">RISK-CAPPED EXECUTION</div>
            <div className="markets-cap"><span>Maximum leverage</span><strong>{hero.maxLeverage}×</strong></div>
            <p>The live cap comes from the market&apos;s binary risk, not a fixed account setting.</p>
            <Link className="markets-trade-cta" href={`/m/${encodeURIComponent(hero.symbol)}`}>
              Trade live market <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        </div>
      </> : <div className="markets-empty">No verified live BTC 15-minute market is available yet.</div>}
    </section>

    <section className="markets-ladder" id="tail-ladder" aria-labelledby="markets-ladder-title">
      <div className="markets-ladder-head">
        <div><p className="markets-eyebrow">OPTIONS-IMPLIED SURFACE</p><h2 id="markets-ladder-title">Tail ladder</h2></div>
        <span>Supported strikes within ±10% of spot</span>
      </div>
      <div className="markets-tabs" role="tablist" aria-label="Market duration">
        {tabs.map(([label, value]) => <button
          type="button"
          role="tab"
          aria-selected={duration === value}
          className={duration === value ? "markets-tab-active" : ""}
          key={value}
          onClick={() => setDuration(value)}
        >{label}</button>)}
      </div>
      <div className="markets-table-scroll">
        <div className="markets-table" role="table" aria-label={`${duration} BTC strike ladder`}>
          <div className="markets-table-row markets-table-head" role="row">
            <span>Strike</span><span>From spot</span><span>Theo YES</span><span>Gemini bid / ask</span><span>Edge</span><span>Max</span><span />
          </div>
          {ladder.length === 0 && <div className="markets-empty">
            No live {tabs.find((tab) => tab[1] === duration)?.[0].toLowerCase()} ladder is available.
          </div>}
          {ladder.map((market) => <div className="markets-table-row" role="row" key={market.symbol}>
            <strong>{dollars(market.strike)}</strong>
            <span>{((market.strike / market.spot - 1) * 100).toFixed(1)}%</span>
            <b className="markets-theo">{cents(market.theo)}</b>
            <Quote market={market} />
            <b className={(market.edge ?? 0) >= 0 ? "markets-positive" : "markets-negative"}>
              {market.edge === undefined ? "—" : `${(market.edge * 100).toFixed(1)}¢`}
            </b>
            <span>{market.maxLeverage}×</span>
            <Link className="markets-row-trade" href={`/m/${encodeURIComponent(market.symbol)}`}>Trade</Link>
          </div>)}
        </div>
      </div>
    </section>
  </div>;
}
