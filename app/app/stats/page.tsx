"use client";

import { useEffect, useMemo, useState } from "react";
import { useDemoAccount } from "@/components/demo-account";
import { WickChart } from "@/components/wick-chart";
import { useFeed } from "@/hooks/use-feed";
import { useMarkets } from "@/hooks/use-markets";
import { backendConfigured, getLpHistory, type LpPoint } from "@/lib/api";
import { GUEST_POOL_HISTORY, GUEST_STATS } from "@/lib/demo/preview";
import { compactAddress, e6 } from "@/lib/format";
import { timeLabel, usd } from "@/lib/markets";
import "@/styles/stats.css";

/* Pool numbers, open markets and liquidations come from the backend today. Open interest, volume, trader PnL and
   exposure have no endpoint yet, so they show placeholders. */
/* "All" spans exactly the history on hand */
const windowsFor = (span: number) => [{ label: "1D", secs: 86_400 }, { label: "1W", secs: 604_800 }, { label: "1M", secs: 2_592_000 }, { label: "All", secs: Math.max(3_600, Math.ceil(span * 1.04)) }];
const NoData = ({ what }: { what: string }) => <div className="nodata">No data yet. {what} will appear here once the backend reports it.</div>;

export default function StatsPage() {
  const account = useDemoAccount();
  const guestPreview = account?.active === true;
  const { markets } = useMarkets();
  const feed = useFeed();
  const [history, setHistory] = useState<LpPoint[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    if (guestPreview || !backendConfigured()) return () => controller.abort();
    void getLpHistory(controller.signal).then(setHistory).catch(() => undefined);
    return () => controller.abort();
  }, [guestPreview]);
  const displayHistory: readonly LpPoint[] = guestPreview ? GUEST_POOL_HISTORY : history;
  const latest = displayHistory.at(-1);
  const series = useMemo(() => displayHistory.map((point) => ({ time: point.blockTime, value: e6(point.balanceE6) })), [displayHistory]);
  const span = series.length > 1 ? series[series.length - 1]!.time - series[0]!.time : 0;
  const open = markets.filter((market) => market.status === "open").length;
  const liquidations = feed.events.filter((event) => event.name === "PositionLiquidated").slice(0, 6);
  const tile = (label: string, value: string | undefined, note: string) => <div className="tile"><span>{label}</span><b>{value ?? "—"}</b><small className="mu">{value === undefined ? "No data yet" : note}</small></div>;
  return <div className="sx-page">
    <div className="pg-hd"><div><h1>Stats</h1><p>{guestPreview ? "A simulated protocol dashboard for visitors exploring Wick." : "Live numbers for the Wick protocol on Solana."}</p></div></div>
    {guestPreview && <p className="demo-provenance" role="status">
      <b>Example demo · simulated locally.</b> Every total, chart, exposure, and event below is illustrative—not Solana state, a QuickNode Stream, or Gemini/Deribit market evidence.
    </p>}
    <section className="p tiles" aria-label="Protocol totals">
      {tile("Pool liquidity", latest ? usd(e6(latest.balanceE6)) : undefined, guestPreview ? "Simulated example" : "Available to pay winners")}
      {tile("Payout queue", latest ? usd(e6(latest.queueOwedE6)) : undefined, guestPreview ? "Simulated example" : "Owed to winners")}
      {tile("Fees earned", latest ? usd(e6(latest.feesE6)) : undefined, guestPreview ? "Simulated example" : "All time")}
      {tile("Open markets", guestPreview ? String(GUEST_STATS.openMarkets) : markets.length ? String(open) : undefined, guestPreview ? "Simulated example" : "BTC strikes and up/down")}
      {tile("Open interest", guestPreview ? usd(GUEST_STATS.openInterest) : undefined, guestPreview ? "Simulated example" : "")}
      {tile("24h volume", guestPreview ? usd(GUEST_STATS.volume24h) : undefined, guestPreview ? "Simulated example" : "")}
    </section>
    <div className="sgrid">
      <section className="p sc"><h3>Open interest <small>Yes and No, all expiries</small></h3>{guestPreview
        ? <div className="demo-metric"><b>{usd(GUEST_STATS.openInterest)}</b><span>Example: 54% Yes · 46% No</span></div>
        : <NoData what="Open interest" />}</section>
      <section className="p sc"><h3>Volume <small>Notional traded</small></h3>{guestPreview
        ? <div className="demo-metric"><b>{usd(GUEST_STATS.volume24h)}</b><span>Illustrative 24-hour notional</span></div>
        : <NoData what="Volume" />}</section>
      <section className="p sc"><h3>Trader PnL <small>Net, all traders</small></h3>{guestPreview
        ? <div className="demo-metric"><b className="up">+{usd(GUEST_STATS.traderPnl)}</b><span>Illustrative aggregate result</span></div>
        : <NoData what="Trader PnL" />}</section>
      <section className="p sc"><h3>Pool liquidity <small>Losses in, payouts out</small></h3>
        {series.length > 1 ? <WickChart key={span ? "ready" : "empty"} series={[{ id: "pool", label: "Pool liquidity", color: "#5fd4cc", data: series }]} format="usd" windows={windowsFor(span)} height={200} initialWindow={windowsFor(span)[3]!.secs}
          formatTime={(time) => new Date(time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} /> : <NoData what="Pool history" />}
      </section>
      <section className="p sc"><h3>Pool exposure by expiry <small>What the pool owes if each side wins</small></h3>{guestPreview ? <div className="expo">
        <div className="legend"><span><i className="dot y" />Yes example</span><span><i className="dot n" />No example</span></div>
        {GUEST_STATS.exposure.map((row) => <div className="er" key={row.expiry}><b>{row.expiry}</b><span className="bar"><i style={{ width: `${row.yes / (row.yes + row.no) * 100}%`, background: "var(--yes-hi)" }} /><i style={{ width: `${row.no / (row.yes + row.no) * 100}%`, background: "var(--no-hi)" }} /></span><span className="nums">{usd(row.yes)} / {usd(row.no)}</span></div>)}
      </div> : <NoData what="Exposure" />}</section>
      <section className="p sc"><h3>Recent liquidations <small>Margin added to the pool</small></h3>
        {guestPreview ? <div className="liqs">{GUEST_STATS.liquidations.map((event) => <div className="lr" key={event.id}>
          <span className="mu">Example</span><span>{event.label}</span><span className="mu">{event.id} · {usd(event.amount)}</span>
        </div>)}</div> : liquidations.length === 0 ? <NoData what="Liquidations" /> : <div className="liqs">
          {liquidations.map((event) => <div className="lr" key={`${event.signature}:${event.eventIndex}`}>
            <span className="mu">{timeLabel(event.blockTime * 1000)}</span><span>Position liquidated</span><span className="mu">{compactAddress(event.signature)}</span>
          </div>)}
        </div>}
      </section>
    </div>
  </div>;
}
