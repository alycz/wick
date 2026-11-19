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
const STAT_WINDOWS = [{ label: "1D", secs: 86_400 }, { label: "1W", secs: 604_800 }, { label: "2W", secs: 1_209_600 }];
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
  const ago = (ts: number) => { const mins = Math.max(1, Math.round((Date.now() - ts) / 60_000)); return mins < 60 ? `${mins}m ago` : `${Math.round(mins / 60)}h ago`; };
  const day = (time: number) => new Date(time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
  const metric = (title: string, note: string, value: string, delta: string | undefined, up: boolean, data: Array<{ time: number; value: number }>, color: string, rise: number) =>
    <section className={`p sc rise rise-${rise}`}>
      <h3>{title} <small>{note}</small></h3>
      <div className="sc-val"><b className={title === "Trader PnL" ? up ? "up" : "down" : ""}>{value}</b>{delta && <span className={up ? "up" : "down"}>{up ? "▲" : "▼"} {delta}</span>}</div>
      <WickChart series={[{ id: title, label: title, color, data }]} format="usd" windows={STAT_WINDOWS} initialWindow={STAT_WINDOWS[1]!.secs} height={190} formatTime={day} />
    </section>;
  const change = (data: ReadonlyArray<{ value: number }>) => { const last = data.at(-1)?.value ?? 0; const before = data.at(-25)?.value ?? last; return { diff: last - before, pct: before ? (last - before) / Math.abs(before) * 100 : 0 }; };
  const oi = change(GUEST_STATS.openInterestSeries); const vol = change(GUEST_STATS.volumeSeries); const pnl = change(GUEST_STATS.traderPnlSeries);
  return <div className="sx-page">
    <section className="p tiles rise" aria-label="Protocol totals">
      {tile("Pool liquidity", latest ? usd(e6(latest.balanceE6)) : undefined, "Available to pay winners")}
      {tile("Payout queue", latest ? usd(e6(latest.queueOwedE6)) : undefined, "Owed to winners")}
      {tile("Fees earned", latest ? usd(e6(latest.feesE6)) : undefined, "All time")}
      {tile("Open markets", guestPreview ? String(GUEST_STATS.openMarkets) : markets.length ? String(open) : undefined, "BTC strikes and up/down")}
      {tile("Open interest", guestPreview ? usd(GUEST_STATS.openInterest) : undefined, `${Math.round(GUEST_STATS.yesShare * 100)}% Yes · ${Math.round((1 - GUEST_STATS.yesShare) * 100)}% No`)}
      {tile("24h volume", guestPreview ? usd(GUEST_STATS.volume24h) : undefined, "Notional traded")}
    </section>
    <div className="sgrid">
      {guestPreview ? metric("Open interest", "Yes and No, all expiries", usd(GUEST_STATS.openInterest), `${Math.abs(oi.pct).toFixed(1)}% in 24h`, oi.diff >= 0, [...GUEST_STATS.openInterestSeries], "#5fd4cc", 1)
        : <section className="p sc"><h3>Open interest <small>Yes and No, all expiries</small></h3><NoData what="Open interest" /></section>}
      {guestPreview ? metric("Volume", "Notional traded, rolling 24h", usd(GUEST_STATS.volume24h), `${Math.abs(vol.pct).toFixed(1)}% in 24h`, vol.diff >= 0, [...GUEST_STATS.volumeSeries], "#9aa8ff", 2)
        : <section className="p sc"><h3>Volume <small>Notional traded</small></h3><NoData what="Volume" /></section>}
      {guestPreview ? metric("Trader PnL", "Net, all traders", `${GUEST_STATS.traderPnl >= 0 ? "+" : "−"}${usd(Math.abs(GUEST_STATS.traderPnl))}`, `${usd(Math.abs(pnl.diff))} in 24h`, pnl.diff >= 0, [...GUEST_STATS.traderPnlSeries], "#22c55e", 3)
        : <section className="p sc"><h3>Trader PnL <small>Net, all traders</small></h3><NoData what="Trader PnL" /></section>}
      <section className="p sc rise rise-4"><h3>Pool liquidity <small>Losses in, payouts out</small></h3>
        {latest && <div className="sc-val"><b>{usd(e6(latest.balanceE6))}</b></div>}
        {series.length > 1 ? <WickChart key={span ? "ready" : "empty"} series={[{ id: "pool", label: "Pool liquidity", color: "#5fd4cc", data: series }]} format="usd" windows={windowsFor(span)} height={190} initialWindow={windowsFor(span)[1]!.secs}
          formatTime={day} /> : <NoData what="Pool history" />}
      </section>
      <section className="p sc rise rise-5"><h3>Pool exposure by expiry <small>What the pool owes if each side wins</small></h3>{guestPreview ? <div className="expo">
        <div className="legend"><span><i className="dot y" />Yes wins</span><span><i className="dot n" />No wins</span></div>
        {GUEST_STATS.exposure.map((row, index) => <div className="er" key={row.expiry}><b>{row.expiry}</b><span className="bar"><i style={{ width: `${row.yes / (row.yes + row.no) * 100}%`, background: "var(--yes-hi)", animationDelay: `${index * 80}ms` }} /><i style={{ width: `${row.no / (row.yes + row.no) * 100}%`, background: "var(--no-hi)", animationDelay: `${index * 80 + 40}ms` }} /></span><span className="nums"><span className="up">{usd(row.yes, 0)}</span> / <span className="down">{usd(row.no, 0)}</span></span></div>)}
      </div> : <NoData what="Exposure" />}</section>
      <section className="p sc rise rise-6"><h3>Recent liquidations <small>Margin added to the pool</small></h3>
        {guestPreview ? <div className="liqs">{GUEST_STATS.liquidations.map((event) => <div className="lr" key={event.id}>
          <span className="mu">{ago(event.ts)}</span>
          <span className="lm"><b>{event.market}</b><small className="mu">{event.trader}</small></span>
          <span><span className={`tag ${event.side === "yes" ? "y" : "n"}`}>{event.side.toUpperCase()} {event.leverage}x</span></span>
          <b>+{usd(event.amount)}</b>
        </div>)}</div> : liquidations.length === 0 ? <NoData what="Liquidations" /> : <div className="liqs">
          {liquidations.map((event) => <div className="lr" key={`${event.signature}:${event.eventIndex}`}>
            <span className="mu">{timeLabel(event.blockTime * 1000)}</span><span className="lm"><b>Position liquidated</b></span><span /><span className="mu">{compactAddress(event.signature)}</span>
          </div>)}
        </div>}
      </section>
    </div>
  </div>;
}
