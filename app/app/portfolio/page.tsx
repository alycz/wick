"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { PositionView, PricerMarket } from "@wick/shared";
import { Seg } from "@/components/markets/controls";
import { useDemoAccount } from "@/components/demo-account";
import { useDemoWallet } from "@/components/wallet-panel";
import { useFeed } from "@/hooks/use-feed";
import { useMarkets } from "@/hooks/use-markets";
import { useWickActions } from "@/hooks/use-wick-actions";
import { backendConfigured, getClaims, getPositions, type ClaimView } from "@/lib/api";
import { latestIndexerEventKey } from "@/lib/feed";
import { cents, compactAddress, e6 } from "@/lib/format";
import { dateLabel, timeLabel, usd } from "@/lib/markets";
import { calculateLivePositionPnls, livePositionPnlE6, marketAddressForSymbol } from "@/lib/portfolio";
import "@/styles/portfolio.css";

type PositionRow = PositionView & Record<string, unknown>;
type Tab = "open" | "queue" | "hist";
const PORTFOLIO_EVENTS = new Set(["PositionOpened", "PositionClosed", "PositionLiquidated", "PositionSettled", "ClaimQueued", "ClaimPaid"]);

function marketLabel(market: PricerMarket | undefined, address: string): { name: string; sub: string } {
  if (!market) return { name: compactAddress(address), sub: "Market" };
  if (market.kind === "up_down") return { name: "BTC Up or Down 15m", sub: `Ends ${timeLabel(market.expiryTs)}` };
  return { name: `BTC > $${(market.strike / 1000).toFixed(market.strike % 1000 ? 1 : 0)}k`, sub: market.duration === "1h" ? `Hourly · ${timeLabel(market.expiryTs)}` : dateLabel(market.expiryTs) };
}

/* demo positions carry the market they were opened on, so expired ones still get a readable name */
const snapshotMarket = (position: PositionRow): PricerMarket | undefined => {
  const snapshot = position.snapshot as Partial<PricerMarket> | undefined;
  return snapshot && typeof snapshot.strike === "number" ? snapshot as PricerMarket : undefined;
};

const signedUsd = (value: number) => `${value >= 0 ? "+" : "−"}${usd(Math.abs(value))}`;

export default function PortfolioPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const router = useRouter();
  const account = useDemoAccount();
  const [chainPositions, setPositions] = useState<PositionRow[]>([]);
  const [chainClaims, setClaims] = useState<ClaimView[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [chainPnls, setLivePnls] = useState<Record<string, string>>({});
  const [chainMarkets, setByAddress] = useState<Record<string, PricerMarket>>({});
  const [tab, setTab] = useState<Tab>("open");
  const actions = useWickActions();
  const feed = useFeed();
  const marketState = useMarkets();
  /* without a wallet, Portfolio shows the demo account; markets stay live */
  const demoMode = actions.demo === true && account !== undefined;
  const owner = demoMode ? account.ledger.owner : demo.publicKey ?? connected.publicKey?.toBase58();
  const backendReady = demoMode || backendConfigured();
  const positions: PositionRow[] = demoMode ? account.ledger.positions as unknown as PositionRow[] : chainPositions;
  const claims: ClaimView[] = demoMode ? account.ledger.claims : chainClaims;
  /* demo positions key markets by symbol, so their PnL is computed directly */
  const demoMarkets = useMemo(() => demoMode ? Object.fromEntries(marketState.markets.map((market) => [market.symbol, market])) : {}, [demoMode, marketState.markets]);
  const byAddress = demoMode ? demoMarkets : chainMarkets;
  const livePnls = useMemo(() => {
    if (!demoMode) return chainPnls;
    const result: Record<string, string> = {};
    for (const position of positions) {
      const market = demoMarkets[position.market];
      if (position.status === "open" && market) result[position.address] = livePositionPnlE6(position, market).toString();
    }
    return result;
  }, [demoMode, chainPnls, positions, demoMarkets]);
  const refreshKey = latestIndexerEventKey(feed.events, PORTFOLIO_EVENTS);

  useEffect(() => {
    const controller = new AbortController();
    if (!owner || !backendReady || demoMode) return () => controller.abort();
    void Promise.all([getPositions(owner, controller.signal), getClaims(owner, controller.signal)])
      .then(([nextPositions, nextClaims]) => { setPositions(nextPositions); setClaims(nextClaims); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [owner, backendReady, demoMode, refreshKey, refreshNonce]);

  useEffect(() => {
    let cancelled = false;
    const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
    if (demoMode || !programId || chainPositions.length === 0 || marketState.markets.length === 0) {
      setLivePnls((value) => Object.keys(value).length ? {} : value);
      return () => { cancelled = true; };
    }
    void calculateLivePositionPnls(chainPositions, marketState.markets, programId)
      .then((values) => { if (!cancelled) setLivePnls(Object.fromEntries([...values].map(([address, value]) => [address, value.toString()]))); })
      .catch(() => { if (!cancelled) setLivePnls({}); });
    void Promise.all(marketState.markets.map(async (market) => [await marketAddressForSymbol(market.symbol, programId), market] as const))
      .then((pairs) => { if (!cancelled) setByAddress(Object.fromEntries(pairs)); })
      .catch(() => { if (!cancelled) setByAddress({}); });
    return () => { cancelled = true; };
  }, [demoMode, chainPositions, marketState.markets]);

  const run = async (key: string, operation: () => Promise<string>) => {
    if (!actions.client) { setError(actions.error ?? "Trading is not configured."); return; }
    setBusy(key); setError(undefined); setSignature(undefined);
    try { setSignature(await operation()); setRefreshNonce((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(undefined); }
  };

  const open = positions.filter((position) => position.status === "open");
  const closed = positions.filter((position) => position.status !== "open");
  const owedClaims = claims.filter((claim) => claim.status !== "paid");
  const totals = useMemo(() => {
    const margin = open.reduce((sum, position) => sum + e6(position.marginE6), 0);
    const known = open.filter((position) => livePnls[position.address] !== undefined);
    const unrealized = known.reduce((sum, position) => sum + e6(livePnls[position.address]), 0);
    const queued = owedClaims.reduce((sum, claim) => sum + e6(claim.amountE6) - e6(claim.paidE6), 0);
    const realized = closed.reduce((sum, position) => sum + (position.realizedPnlE6 === undefined ? 0 : e6(String(position.realizedPnlE6))), 0);
    return { margin, unrealized: known.length ? unrealized : undefined, queued, realized };
  }, [open, closed, owedClaims, livePnls]);
  const disabled = !backendReady || !actions.client;
  const go = (market: PricerMarket | undefined) => { if (market) router.push(`/m/${encodeURIComponent(market.symbol)}`); };

  return <div className="pf-page">
    <header className="pf-head">
      <div><h1>Portfolio</h1><p>{demoMode ? "Browser-only practice using live prices. Local activity is not on-chain; connect a wallet for Solana devnet positions." : "Positions and payouts read from Wick\u2019s on-chain events."}</p></div>
      {owner && <div className="pf-wallet"><span>{demoMode ? "Demo account" : "Wallet"}</span><b>{demoMode ? usd(e6(account.ledger.usdcE6)) : compactAddress(owner)}</b></div>}
    </header>

    {(!owner || (owner && !backendReady) || (backendReady && owner && !actions.client) || error || signature) && <div className="pf-alerts">
      {!owner && <p className="pf-note">Connect Phantom or Solflare, or create a local wallet from the wallet menu, to see your portfolio.</p>}
      {owner && !backendReady && <p className="pf-note">Positions can&apos;t load because the backend isn&apos;t configured.</p>}
      {owner && backendReady && !actions.client && <p className="pf-note">{actions.error ?? "Trading is not configured."}</p>}
      {error && <p className="pf-note pf-err" role="alert">{error}</p>}
      {signature && <p className="pf-note pf-ok" role="status">{demoMode
        ? `Local demo complete · ${signature} · no network transaction`
        : `Devnet transaction confirmed · ${compactAddress(signature)}`}</p>}
    </div>}

    <section className="pf-stats" aria-label="Summary">
      <div><span>In open positions</span><b>{usd(totals.margin)}</b><small>{open.length} open</small></div>
      <div><span>Unrealized PnL</span><b className={totals.unrealized === undefined ? "" : totals.unrealized >= 0 ? "up" : "down"}>{totals.unrealized === undefined ? "—" : signedUsd(totals.unrealized)}</b><small>At Wick&apos;s fair price</small></div>
      <div><span>Realized PnL</span><b className={totals.realized >= 0 ? "up" : "down"}>{signedUsd(totals.realized)}</b><small>{closed.length} closed</small></div>
      <div><span>Payouts queued</span><b>{usd(totals.queued)}</b><small>{owedClaims.length} {owedClaims.length === 1 ? "claim" : "claims"} waiting</small></div>
    </section>

    <section aria-label="Positions">
      <Seg className="pf-tabs" label="Portfolio" value={tab} onChange={setTab}
        options={[{ value: "open", label: `Positions (${open.length})` }, { value: "queue", label: `Payout queue (${owedClaims.length})` }, { value: "hist", label: "History" }]} />
      {tab === "open" && (open.length === 0 ? <p className="pf-empty">No open positions. Open one from Markets.</p> : <div className="pf-list">
        <div className="prow hd"><span>Market</span><span>Side</span><span>Contracts</span><span>Entry → now</span><span>PnL</span><span>Action</span></div>
        {open.map((position) => {
          const market = byAddress[position.market];
          const label = marketLabel(market ?? snapshotMarket(position), position.market);
          const pnl = livePnls[position.address] === undefined ? undefined : e6(livePnls[position.address]);
          const mark = market ? (position.side === "yes" ? market.theo : 1 - market.theo) : undefined;
          const key = position.address;
          return <div className={`prow${market ? " go" : ""}`} key={key} onClick={() => go(market)} role={market ? "link" : undefined}
            tabIndex={market ? 0 : undefined} onKeyDown={(event) => { if (event.key === "Enter") go(market); }}>
            <div className="pm"><div className="coin xs" aria-hidden="true">₿</div><div><b>{label.name}</b><small>{label.sub}</small></div></div>
            <span><span className={`tag ${position.side === "yes" ? "y" : "n"}`}>{position.side.toUpperCase()} {position.leverage}x</span></span>
            <div className="v"><b>{e6(position.contractsE6).toLocaleString("en-US", { maximumFractionDigits: 1 })}</b><small>Margin {usd(e6(position.marginE6))}</small></div>
            <div className="v"><b>{cents(position.entryE6 / 1_000_000)} → {cents(mark)}</b><small>Liquidates at {cents(position.liqMarkE6 / 1_000_000)}</small></div>
            <b className={pnl === undefined ? "" : pnl >= 0 ? "up" : "down"}>{pnl === undefined ? "—" : signedUsd(pnl)}</b>
            <div className="pf-acts" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="ghost" disabled={busy === key || disabled} onClick={() => void run(key, () => actions.client!.closePosition(position, 10_000))}>{busy === key ? "Confirming…" : "Close"}</button>
              <button type="button" className="ghost" disabled={busy === key || disabled} onClick={() => void run(key, () => actions.client!.settlePosition(position))}>Settle</button>
            </div>
          </div>;
        })}
      </div>)}
      {tab === "queue" && (claims.length === 0 ? <p className="pf-empty">No payouts are waiting. When the pool is short, winning payouts queue here in order.</p> : <div className="pf-list">
        <div className="prow hd"><span>Claim</span><span>Owed</span><span>Paid</span><span>Remaining</span><span>Status</span><span>Action</span></div>
        {claims.map((claim) => {
          const owed = e6(claim.amountE6); const paid = e6(claim.paidE6);
          return <div className="prow" key={claim.address}>
            <b>#{claim.claimIndex}</b><span>{usd(owed)}</span><span>{usd(paid)}</span><b>{usd(owed - paid)}</b>
            <span><span className={`tag ${claim.status === "paid" ? "y" : "q"}`}>{claim.status.charAt(0).toUpperCase() + claim.status.slice(1)}</span></span>
            <div className="pf-acts"><button type="button" className="ghost" disabled={busy === claim.address || claim.status === "paid" || disabled}
              onClick={() => void run(claim.address, () => actions.client!.claimQueue(claim))}>{busy === claim.address ? "Confirming…" : "Claim"}</button></div>
          </div>;
        })}
      </div>)}
      {tab === "hist" && (closed.length === 0 ? <p className="pf-empty">No closed positions yet.</p> : <div className="pf-list">
        <div className="prow hd"><span>Market</span><span>Side</span><span>Margin</span><span>Entry</span><span>Result</span><span>PnL</span></div>
        {closed.map((position) => {
          const market = byAddress[position.market];
          const label = marketLabel(market ?? snapshotMarket(position), position.market);
          const pnl = position.realizedPnlE6 === undefined ? undefined : e6(String(position.realizedPnlE6));
          return <div className={`prow${market ? " go" : ""}`} key={position.address} onClick={() => go(market)}>
            <div className="pm"><div className="coin xs" aria-hidden="true">₿</div><div><b>{label.name}</b><small>{label.sub}</small></div></div>
            <span><span className={`tag ${position.side === "yes" ? "y" : "n"}`}>{position.side.toUpperCase()} {position.leverage}x</span></span>
            <span>{usd(e6(position.marginE6))}</span>
            <span>{cents(position.entryE6 / 1_000_000)}</span>
            <span><span className={`tag ${position.status === "liquidated" ? "n" : "d"}`}>{position.status.charAt(0).toUpperCase() + position.status.slice(1)}</span></span>
            <b className={pnl === undefined ? "" : pnl >= 0 ? "up" : "down"}>{pnl === undefined ? "—" : signedUsd(pnl)}</b>
          </div>;
        })}
      </div>)}
    </section>
  </div>;
}
