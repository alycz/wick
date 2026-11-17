"use client";

import { useFeed } from "@/hooks/use-feed";
import { compactAddress } from "@/lib/format";
import { useEffect, useState } from "react";

const names: Record<string, string> = {
  PositionOpened: "Position opened", PositionClosed: "Position closed", PositionLiquidated: "Liquidation",
  MarketSettled: "Market settled", ClaimQueued: "Payout queued", ClaimPaid: "Payout paid", LpUpdated: "Pool updated",
};

export function ActivityRail() {
  const { events, connected, loading, error } = useFeed();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const recentQuickNodeEvent = events.some((event) => {
    const ageMs = now - event.blockTime * 1_000;
    return event.provenance === "quicknode_stream" && ageMs >= 0 && ageMs <= 60_000;
  });
  const status = connected && recentQuickNodeEvent
    ? "Live via QuickNode Streams"
    : loading
      ? "QuickNode Stream unverified · loading indexer"
      : connected
        ? "QuickNode Stream unverified · awaiting live event"
        : error
          ? "QuickNode Stream unverified · indexer unavailable"
          : "QuickNode Stream unverified · reconnecting";
  return (
    <aside className="chrome-activity" aria-label="Market activity">
      <div className="chrome-activity-head">
        <span className="chrome-activity-eyebrow">Network activity</span>
        <div className="chrome-activity-status"><span className={`chrome-live-dot ${connected && recentQuickNodeEvent ? "connected" : ""}`} /> {status}</div>
      </div>
      <div className="chrome-activity-list">
        {events.length === 0 && <div className="chrome-activity-empty">{loading ? "Loading indexed devnet events…" : error ? "Indexer feed unavailable." : "No indexed devnet events yet."}</div>}
        {events.map((event) => (
          <a className="chrome-activity-item" key={`${event.signature}-${event.eventIndex}`}
            href={`https://explorer.solana.com/tx/${event.signature}?cluster=devnet`} target="_blank" rel="noreferrer">
            <span className="chrome-activity-title">{names[event.name] ?? event.name}</span>
            <small className="chrome-activity-meta">{new Date(event.blockTime * 1_000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {compactAddress(event.signature)} · {event.provenance === "quicknode_stream" ? "Stream" : "RPC reconciled"}</small>
          </a>
        ))}
      </div>
    </aside>
  );
}
