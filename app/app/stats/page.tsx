"use client";

import { useEffect, useMemo, useState } from "react";
import { useShowSimulated } from "@/components/demo-account";
import { WickChart } from "@/components/wick-chart";
import { useFeed } from "@/hooks/use-feed";
import { useMarkets } from "@/hooks/use-markets";
import { getLpHistory, type LpPoint } from "@/lib/api";
import { exposure, liquidations, protocolStats } from "@/lib/demo/stats-sim";
import { compactAddress, e6 } from "@/lib/format";
import { expiryGroups, signed, timeLabel, usd } from "@/lib/markets";
import "@/styles/stats.css";

/* Pool numbers, open markets and liquidations come from the backend. Open interest, volume, trader PnL and exposure
   have no endpoint yet: visitors on demo data see simulated values, everyone else sees placeholders. */
const WINDOWS = [{ label: "1D", secs: 86_400 }, { label: "1W", secs: 604_800 }, { label: "1M", secs: 2_592_000 }];
/* "All" spans exactly the history on hand */
const poolWindows = (span: number) => [{ label: "1D", secs: 86_400 }, { label: "1W", secs: 604_800 }, { label: "All", secs: Math.max(3_600, Math.ceil(span * 1.04)) }];
const day = (time: number) => new Date(time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
const compact = (value: number) => `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })}`;
const NoData = ({ what }: { what: string }) => <div className="nodata">No data yet. {what} will appear here once the backend reports it.</div>;

export default function StatsPage() {
  const simulated = useShowSimulated();
  const { markets } = useMarkets();
  const feed = useFeed();
  const [history, setHistory] = useState<LpPoint[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    void getLpHistory(controller.signal).then(setHistory).catch(() => undefined);
    return () => controller.abort();
  }, []);
  const sim = useMemo(() => simulated ? protocolStats() : undefined, [simulated]);
  const groups = useMemo(() => expiryGroups(markets), [markets]);
  const expo = useMemo(() => simulated ? exposure(groups.map((group) => group.name)) : [], [simulated, groups]);
  const expoMax = Math.max(1, ...expo.map((row) => row.yes + row.no));

  const latest = history.at(-1);
  const dayAgo = history.length > 24 ? history[history.length - 25] : history[0];
  const series = useMemo(() => history.map((point) => ({ time: point.blockTime, value: e6(point.balanceE6) })), [history]);
  const span = series.length > 1 ? series[series.length - 1]!.time - series[0]!.time : 0;
  const poolChange = latest && dayAgo ? e6(latest.balanceE6) - e6(dayAgo.balanceE6) : undefined;
  const open = markets.filter((market) => market.status === "open").length;
  const liveLiqs = feed.events.filter((event) => event.name === "PositionLiquidated").slice(0, 6);
  const simLiqs = useMemo(() => simulated ? liquidations() : [], [simulated]);

  const tile = (label: string, value: string | undefined, note: string, tone?: "up" | "down") => <div className="tile"><span>{label}</span><b>{value ?? "—"}</b>
    <small className={value === undefined ? "mu" : tone ?? "mu"}>{value === undefined ? "No data yet" : note}</small></div>;

  return <div className="sx-page">
    <div className="pg-hd"><div><h1>Stats</h1><p>Live numbers for the Wick protocol on Solana.</p></div></div>
    <section className="p tiles" aria-label="Protocol totals">
      {tile("24h volume", sim ? compact(sim.volume24h) : undefined, sim ? `${compact(sim.totalVolume)} all time` : "")}
      {tile("Open interest", sim ? compact(sim.openInterest) : undefined, sim ? `${compact(sim.oiYes.at(-1)!.value)} Yes · ${compact(sim.oiNo.at(-1)!.value)} No` : "")}
      {tile("Trades", sim ? sim.trades.toLocaleString("en-US") : undefined, sim ? `${sim.traders.toLocaleString("en-US")} traders` : "")}
      {tile("Pool liquidity", latest ? compact(e6(latest.balanceE6)) : undefined, poolChange === undefined ? "Available to pay winners" : `${signed(poolChange, compact)} today`, poolChange === undefined ? undefined : poolChange >= 0 ? "up" : "down")}
      {tile("Fees earned", latest ? compact(e6(latest.feesE6)) : undefined, "All time, to stakers and LPs")}
      {tile("Open markets", markets.length ? String(open) : undefined, "BTC strikes and up/down")}
    </section>
    <div className="sgrid">
      <section className="p sc"><h3>Open interest <small>Yes and No, all expiries</small></h3>
        {sim ? <WickChart series={[{ id: "yes", label: "Yes", color: "#3ecf8e", data: sim.oiYes }, { id: "no", label: "No", color: "#f0505d", data: sim.oiNo }]} format="usd" windows={WINDOWS} height={200} formatTime={day} /> : <NoData what="Open interest" />}
      </section>
      <section className="p sc"><h3>Volume <small>Cumulative notional traded</small></h3>
        {sim ? <WickChart series={[{ id: "vol", label: "Volume", color: "#5fd4cc", data: sim.volume }]} format="usd" windows={WINDOWS} height={200} formatTime={day} /> : <NoData what="Volume" />}
      </section>
      <section className="p sc"><h3>Trader PnL <small>Net, all traders</small></h3>
        {sim ? <WickChart series={[{ id: "pnl", label: "Trader PnL", color: sim.traderPnl.at(-1)!.value >= 0 ? "#3ecf8e" : "#f0505d", data: sim.traderPnl }]} format="usd" windows={WINDOWS} height={200} formatTime={day} refLine={{ value: 0 }} /> : <NoData what="Trader PnL" />}
      </section>
      <section className="p sc"><h3>Pool liquidity <small>Losses in, payouts out</small></h3>
        {series.length > 1 ? <WickChart key={span ? "ready" : "empty"} series={[{ id: "pool", label: "Pool liquidity", color: "#5fd4cc", data: series }]} format="usd" windows={poolWindows(span)} height={200} initialWindow={poolWindows(span)[2]!.secs} formatTime={day} /> : <NoData what="Pool history" />}
      </section>
      <section className="p sc"><h3>Pool exposure by expiry <small>What the pool owes if each side wins</small></h3>
        {expo.length ? <div className="expo">
          {expo.map((row) => <div className="er" key={row.label}>
            <span>{row.label}</span>
            <div className="bar" aria-hidden><i style={{ width: `${row.yes / expoMax * 100}%`, background: "var(--yes-hi)" }} /><i style={{ width: `${row.no / expoMax * 100}%`, background: "var(--no-hi)" }} /></div>
            <span className="nums"><span className="up">{compact(row.yes)}</span> / <span className="down">{compact(row.no)}</span></span>
          </div>)}
          <div className="legend mu"><span><i className="dot y" />Owed if Yes wins</span><span><i className="dot n" />Owed if No wins</span></div>
        </div> : <NoData what="Exposure" />}
      </section>
      <section className="p sc"><h3>Recent liquidations <small>Margin added to the pool</small></h3>
        {simLiqs.length ? <div className="liqs">
          {simLiqs.map((row) => <div className="lr" key={row.time}>
            <span className="mu">{timeLabel(row.time)}</span>
            <span className="lm">{row.market} <span className={`tag ${row.tone}`}>{row.side}</span></span>
            <span>{usd(row.margin)}</span>
          </div>)}
        </div> : liveLiqs.length === 0 ? <NoData what="Liquidations" /> : <div className="liqs">
          {liveLiqs.map((event) => <div className="lr" key={`${event.signature}:${event.eventIndex}`}>
            <span className="mu">{timeLabel(event.blockTime * 1000)}</span><span>Position liquidated</span><span className="mu">{compactAddress(event.signature)}</span>
          </div>)}
        </div>}
      </section>
    </div>
  </div>;
}
