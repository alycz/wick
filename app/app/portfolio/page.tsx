"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import type { PositionView } from "@wick/shared";
import { useDemoWallet } from "@/components/wallet-panel";
import { useFeed } from "@/hooks/use-feed";
import { useMarkets } from "@/hooks/use-markets";
import { useWickActions } from "@/hooks/use-wick-actions";
import { backendConfigured, getClaims, getPositions, type ClaimView } from "@/lib/api";
import { latestIndexerEventKey } from "@/lib/feed";
import { cents, compactAddress, dollars, e6 } from "@/lib/format";
import { calculateLivePositionPnls } from "@/lib/portfolio";
import "@/styles/account.css";

type PositionRow = PositionView & Record<string, unknown>;
const PORTFOLIO_EVENTS = new Set(["PositionOpened", "PositionClosed", "PositionLiquidated", "PositionSettled", "ClaimQueued", "ClaimPaid"]);

export default function PortfolioPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const owner = demo.publicKey ?? connected.publicKey?.toBase58();
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [claims, setClaims] = useState<ClaimView[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [signature, setSignature] = useState<string>();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [livePnls, setLivePnls] = useState<Record<string, string>>({});
  const actions = useWickActions();
  const feed = useFeed();
  const marketState = useMarkets();
  const backendReady = backendConfigured();
  const refreshKey = latestIndexerEventKey(feed.events, PORTFOLIO_EVENTS);
  useEffect(() => {
    const controller = new AbortController();
    if (!owner || !backendReady) return () => controller.abort();
    void Promise.all([getPositions(owner, controller.signal), getClaims(owner, controller.signal)])
      .then(([nextPositions, nextClaims]) => { setPositions(nextPositions); setClaims(nextClaims); setError(undefined); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [owner, backendReady, refreshKey, refreshNonce]);
  useEffect(() => {
    let cancelled = false;
    const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
    if (!programId || positions.length === 0 || marketState.markets.length === 0) {
      setLivePnls({});
      return () => { cancelled = true; };
    }
    void calculateLivePositionPnls(positions, marketState.markets, programId)
      .then((values) => {
        if (!cancelled) setLivePnls(Object.fromEntries([...values].map(([address, value]) => [address, value.toString()])));
      })
      .catch(() => { if (!cancelled) setLivePnls({}); });
    return () => { cancelled = true; };
  }, [positions, marketState.markets]);
  const run = async (key: string, operation: () => Promise<string>) => {
    if (!actions.client) { setError(actions.error ?? "Trading is not configured."); return; }
    setBusy(key); setError(undefined); setSignature(undefined);
    try { setSignature(await operation()); setRefreshNonce((value) => value + 1); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(undefined); }
  };

  return <div className="account-page">
    <header className="account-hero">
      <div>
        <p className="account-eyebrow">DEVNET ACCOUNT</p>
        <h1>Portfolio</h1>
        <p>Positions and payouts indexed directly from Wick program events.</p>
      </div>
      {owner && <div className="account-wallet"><span>Active wallet</span><strong>{compactAddress(owner)}</strong></div>}
    </header>

    <div className="account-alerts">
      {!owner && <div className="account-notice">Create the demo wallet or connect Phantom / Solflare to load a portfolio.</div>}
      {owner && !backendReady && <div className="account-notice">Backend is not configured. No position data can be verified.</div>}
      {backendReady && !actions.client && <div className="account-notice">{actions.error ?? "Trading is not configured."}</div>}
      {error && <div className="account-notice account-notice-error" role="alert">{error}</div>}
      {signature && <div className="account-notice account-notice-success" role="status">Confirmed on devnet · {compactAddress(signature)}</div>}
    </div>

    <section className="account-surface account-positions" aria-labelledby="account-positions-heading">
      <div className="account-section-heading">
        <div>
          <p className="account-section-kicker">Open &amp; settled</p>
          <h2 id="account-positions-heading">Positions</h2>
        </div>
        <span>{positions.length} indexed</span>
      </div>
      {positions.length === 0 ? <div className="account-empty">No indexed positions for this wallet.</div> : <div className="account-table-wrap">
        <table className="account-table">
          <thead><tr><th>Market</th><th>Side</th><th>Margin</th><th>Leverage</th><th>Entry</th><th>Contracts</th><th>PnL</th><th><span className="account-visually-hidden">Actions</span></th></tr></thead>
          <tbody>{positions.map((position) => {
            const pnlValue = position.status === "open" ? livePnls[position.address] : position.realizedPnlE6 === undefined ? undefined : String(position.realizedPnlE6);
            const pnl = pnlValue === undefined ? undefined : e6(pnlValue);
            return <tr key={position.address}>
              <td data-label="Market"><div className="account-market"><strong>{compactAddress(position.market)}</strong><span>{position.status}</span></div></td>
              <td data-label="Side"><span className={`account-side account-side-${position.side}`}>{position.side.toUpperCase()}</span></td>
              <td data-label="Margin">{dollars(e6(position.marginE6), 2)}</td>
              <td data-label="Leverage">{position.leverage}×</td>
              <td data-label="Entry">{cents(position.entryE6 / 1_000_000)}</td>
              <td data-label="Contracts">{e6(position.contractsE6).toFixed(2)}</td>
              <td data-label={position.status === "open" ? "Live PnL" : "Realized PnL"}><span className={pnl === undefined ? "account-pnl" : pnl >= 0 ? "account-pnl account-pnl-positive" : "account-pnl account-pnl-negative"}>{pnl === undefined ? "—" : dollars(pnl, 2)}</span></td>
              <td data-label="Actions">{position.status === "open" ? <div className="account-row-actions">
                <button className="account-button account-button-secondary" type="button" disabled={busy === position.address || !backendReady || !actions.client} onClick={() => void run(position.address, () => actions.client!.closePosition(position, 10_000))}>{busy === position.address ? "Confirming…" : "Close"}</button>
                <button className="account-button account-button-text" type="button" disabled={busy === position.address || !backendReady || !actions.client} onClick={() => void run(position.address, () => actions.client!.settlePosition(position))}>Settle</button>
              </div> : <span className="account-complete">Complete</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>}
    </section>

    <section className="account-surface account-claims" aria-labelledby="account-claims-heading">
      <div className="account-section-heading">
        <div><p className="account-section-kicker">FIFO pool payouts</p><h2 id="account-claims-heading">Queued claims</h2></div>
        <span>{claims.length} total</span>
      </div>
      {claims.length === 0 ? <div className="account-empty">No queued claims.</div> : <div className="account-table-wrap">
        <table className="account-table account-claims-table">
          <thead><tr><th>Claim</th><th>Amount owed</th><th>Status</th><th><span className="account-visually-hidden">Action</span></th></tr></thead>
          <tbody>{claims.map((claim) => <tr key={claim.address}>
            <td data-label="Claim"><strong>#{claim.claimIndex}</strong></td>
            <td data-label="Amount owed"><strong>{dollars(e6(claim.amountE6) - e6(claim.paidE6), 2)}</strong></td>
            <td data-label="Status"><span className="account-status">{claim.status}</span></td>
            <td data-label="Action"><button className="account-button account-button-secondary" disabled={busy === claim.address || claim.status === "paid" || !backendReady || !actions.client} onClick={() => void run(claim.address, () => actions.client!.claimQueue(claim))} type="button">{busy === claim.address ? "Confirming…" : "Claim"}</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  </div>;
}
