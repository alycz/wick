"use client";

import { useEffect, useMemo, useState } from "react";
import { WickChart } from "@/components/wick-chart";
import { useFeed } from "@/hooks/use-feed";
import { useMarkets } from "@/hooks/use-markets";
import { backendConfigured, getLpHistory, type LpPoint } from "@/lib/api";
import { compactAddress, e6 } from "@/lib/format";
import { timeLabel, usd } from "@/lib/markets";
import "@/styles/stats.css";

/* Pool numbers, open markets and liquidations come from the backend today. Open interest, volume, trader PnL and
   exposure have no endpoint yet, so they show placeholders. */
/* "All" spans exactly the history on hand */
const windowsFor = (span: number) => [{ label: "1D", secs: 86_400 }, { label: "1W", secs: 604_800 }, { label: "1M", secs: 2_592_000 }, { label: "All", secs: Math.max(3_600, Math.ceil(span * 1.04)) }];
const NoData = ({ what }: { what: string }) => <div className="nodata">No data yet. {what} will appear here once the backend reports it.</div>;

export default function StatsPage() {
  const { markets } = useMarkets();
  const feed = useFeed();
  const [history, setHistory] = useState<LpPoint[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    if (!backendConfigured()) return () => controller.abort();
    void getLpHistory(controller.signal).then(setHistory).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const latest = history.at(-1);
  const series = useMemo(() => history.map((point) => ({ time: point.blockTime, value: e6(point.balanceE6) })), [history]);
  const span = series.length > 1 ? series[series.length - 1]!.time - series[0]!.time : 0;
  const open = markets.filter((market) => market.status === "open").length;
  const liquidations = feed.events.filter((event) => event.name === "PositionLiquidated").slice(0, 6);
  const tile = (label: string, value: string | undefined, note: string) => <div className="tile"><span>{label}</span><b>{value ?? "—"}</b><small className="mu">{value === undefined ? "No data yet" : note}</small></div>;
  return <div className="sx-page">
    <div className="pg-hd"><div><h1>Stats</h1><p>Live numbers for the Wick protocol on Solana.</p></div></div>
    <section className="p tiles" aria-label="Protocol totals">
      {tile("Pool liquidity", latest ? usd(e6(latest.balanceE6)) : undefined, "Available to pay winners")}
      {tile("Payout queue", latest ? usd(e6(latest.queueOwedE6)) : undefined, "Owed to winners")}
      {tile("Fees earned", latest ? usd(e6(latest.feesE6)) : undefined, "All time")}
      {tile("Open markets", markets.length ? String(open) : undefined, "BTC strikes and up/down")}
      {tile("Open interest", undefined, "")}
      {tile("24h volume", undefined, "")}
    </section>
    <div className="sgrid">
      <section className="p sc"><h3>Open interest <small>Yes and No, all expiries</small></h3><NoData what="Open interest" /></section>
      <section className="p sc"><h3>Volume <small>Notional traded</small></h3><NoData what="Volume" /></section>
      <section className="p sc"><h3>Trader PnL <small>Net, all traders</small></h3><NoData what="Trader PnL" /></section>
      <section className="p sc"><h3>Pool liquidity <small>Losses in, payouts out</small></h3>
        {series.length > 1 ? <WickChart key={span ? "ready" : "empty"} series={[{ id: "pool", label: "Pool liquidity", color: "#5fd4cc", data: series }]} format="usd" windows={windowsFor(span)} height={200} initialWindow={windowsFor(span)[3]!.secs}
          formatTime={(time) => new Date(time * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" })} /> : <NoData what="Pool history" />}
      </section>
      <section className="p sc"><h3>Pool exposure by expiry <small>What the pool owes if each side wins</small></h3><NoData what="Exposure" /></section>
      <section className="p sc"><h3>Recent liquidations <small>Margin added to the pool</small></h3>
        {liquidations.length === 0 ? <NoData what="Liquidations" /> : <div className="liqs">
          {liquidations.map((event) => <div className="lr" key={`${event.signature}:${event.eventIndex}`}>
            <span className="mu">{timeLabel(event.blockTime * 1000)}</span><span>Position liquidated</span><span className="mu">{compactAddress(event.signature)}</span>
          </div>)}
        </div>}
      </section>
    </div>
  </div>;
}
