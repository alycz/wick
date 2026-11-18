"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PricerMarket } from "@wick/shared";
import { WickChart, type ChartPoint } from "@/components/wick-chart";
import { useMarketHistory, useMarkets } from "@/hooks/use-markets";
import { cents } from "@/lib/format";
import { defaultStrike, expiryGroups, shortLeft, usd } from "@/lib/markets";

/* Landing page, ported from the redesign prototype's home view. Live pieces use real market data and stay empty without it. */

function LiveCard({ market, now }: { market?: PricerMarket; now?: number }) {
  const { history } = useMarketHistory(market?.symbol ?? "");
  const series = useMemo<ChartPoint[]>(() => {
    const points = history.map((point) => ({ time: Math.floor(point.ts / 1000), value: point.spot }));
    if (market && now) points.push({ time: Math.floor(now / 1000), value: market.spot });
    return points;
  }, [history, market, now]);
  const href = market ? `/m/${encodeURIComponent(market.symbol)}` : "/trade";
  const upDown = market?.kind === "up_down";
  return <div className="live-card rise" aria-label="Live market">
    <div className="lc-head">
      <div className="ev-id"><div className="coin" aria-hidden="true">₿</div>
        <div><b>{market ? upDown ? `BTC Up or Down · ${market.duration === "15m" ? "15 min" : market.duration}` : `BTC above ${usd(market.strike, 0)}` : "BTC markets"}</b>
          <small>{market ? `${upDown ? "Price to beat" : "Spot"} ${usd(upDown ? market.strike : market.spot)}` : "Waiting for live prices"}</small></div>
      </div>
      <span className="lc-clock">{market && now ? shortLeft(market.expiryTs - now) : "—"}</span>
    </div>
    <div className="lc-chart">
      {series.length > 1
        ? <WickChart series={[{ id: "btc", label: "BTC", color: "#f7931a", data: series }]} format="usd" height={230} windows={[{ label: "5m", secs: 300 }]} initialWindow={300}
          {...(upDown && market ? { refLine: { value: market.strike, label: "Target" } } : {})} />
        : <div className="lc-empty">Live BTC chart appears when prices load.</div>}
    </div>
    <div className="lc-yn">
      <Link href={href} className="by">{upDown ? "Up" : "Yes"} {market ? cents(market.theo) : "—"}</Link>
      <Link href={href} className="bn">{upDown ? "Down" : "No"} {market ? cents(1 - market.theo) : "—"}</Link>
    </div>
  </div>;
}

export default function LandingPage() {
  const { markets } = useMarkets();
  const [now, setNow] = useState<number>();
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const groups = useMemo(() => expiryGroups(markets), [markets]);
  const featured = groups[0] ? defaultStrike(groups[0].markets) : undefined;
  const ladderGroup = groups.find((group) => !group.upDown && group.markets.length > 2);
  const near = useMemo(() => {
    if (!ladderGroup) return [];
    const middle = defaultStrike(ladderGroup.markets);
    const index = middle ? ladderGroup.markets.indexOf(middle) : 0;
    return ladderGroup.markets.slice(Math.max(0, index - 2), index + 3);
  }, [ladderGroup]);
  const strikeCount = groups.reduce((sum, group) => sum + (group.upDown ? 0 : group.markets.length), 0);
  const levRange = markets.length ? `${Math.min(...markets.map((m) => m.maxLeverage))}–${Math.max(...markets.map((m) => m.maxLeverage))}x` : "2–300x";

  return <div className="hm">
    <section className="hero">
      <div className="rise">
        <h1>Every Bitcoin strike, <span>priced fairly.</span></h1>
        <p>Trade Gemini&apos;s BTC prediction markets with leverage. Wick prices every strike from the options market, including the tails where Gemini&apos;s book is thin, and caps leverage for each market by how fast it can move.</p>
        <div className="hero-cta"><Link className="a1" href="/trade">Start trading</Link><Link className="a2" href="/pool">See the pool</Link></div>
      </div>
      <LiveCard {...(featured ? { market: featured } : {})} {...(now ? { now } : {})} />
    </section>

    <section className="numbers" aria-label="Wick in numbers">
      <div><b>{strikeCount || "—"}</b><span>BTC strikes priced right now</span></div>
      <div><b>{levRange}</b><span>Leverage cap, set per market</span></div>
      <div><b>{groups.length || 5}</b><span>Expiries, from 15 minutes to month-end</span></div>
      <div><b>Gemini</b><span>Settles every market</span></div>
    </section>

    <section className="split">
      <div>
        <h2>A fair price where the order book runs out.</h2>
        <p>Gemini&apos;s book is deep near the money and thin in the tails. Wick turns Deribit&apos;s BTC options volatility into a fair chance for every strike.</p>
        <Link className="ghost" href="/trade">Open the strike ladder</Link>
      </div>
      <div className="mini" aria-label="Strikes near the money">
        <div className="mrow hd"><span>BTC above{ladderGroup ? ` · ${ladderGroup.label}` : ""}</span><span>Wick</span><span>Leverage cap</span></div>
        {near.length === 0 ? <div className="mini-empty">Strikes appear here when live prices load.</div> : near.map((market) =>
          <Link className="mrow" key={market.symbol} href={`/m/${encodeURIComponent(market.symbol)}`}>
            <div><b>{market.strike.toLocaleString("en-US")}</b><div className="bar"><i style={{ width: `${Math.round(market.theo * 100)}%` }} /></div></div>
            <b style={{ color: "var(--wick)" }}>{Math.round(market.theo * 100)}%</b>
            <span>{market.maxLeverage}x</span>
          </Link>)}
      </div>
    </section>

    <section>
      <div className="steps">
        <div><span>1</span><b>Pick a strike and a side</b><p>Choose a BTC strike and expiry to see its current fair price and price history.</p></div>
        <div><span>2</span><b>Size it with leverage</b><p>Each market has its own cap. Contracts near the money with minutes left get less leverage than far tails.</p></div>
        <div><span>3</span><b>Settle on Gemini&apos;s result</b><p>At expiry the market settles on Gemini&apos;s official outcome. Winnings are paid from the pool, in order.</p></div>
      </div>
    </section>

    <section className="split">
      <div><h2>Questions</h2><p>Wick runs on Solana. Prices come from Deribit options and markets settle on Gemini.</p></div>
      <div className="faq">
        <details open><summary>Where do prices come from?</summary><p>Wick&apos;s fair price comes from BTC spot and Deribit&apos;s options volatility, with Derive and realized volatility as fallbacks.</p></details>
        <details><summary>How is the leverage cap set?</summary><p>From binary gamma: how sharply a contract&apos;s value can swing for a small BTC move. The sharper the swing, the lower the cap.</p></details>
        <details><summary>Who pays winners?</summary><p>The pool. It fills up from losing trades rather than outside deposits. If the pool runs short, payouts wait in a first-in, first-out queue.</p></details>
      </div>
    </section>
  </div>;
}
