"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { Seg } from "@/components/markets/controls";
import { useDemoWallet } from "@/components/wallet-panel";
import { compactAddress } from "@/lib/format";
import "@/styles/stats.css";

/* Ranks need per-trader results from the backend, which it doesn't serve yet, so the page shows its frame with placeholders. */
type Period = "24h" | "7d" | "30d" | "all";
type By = "pnl" | "volume";

export default function LeaderboardPage() {
  const connected = useWallet();
  const demo = useDemoWallet();
  const owner = demo.publicKey ?? connected.publicKey?.toBase58();
  const [period, setPeriod] = useState<Period>("7d");
  const [by, setBy] = useState<By>("pnl");
  return <div className="lb-page">
    <div className="pg-hd">
      <div><h1>Leaderboard</h1><p>Top Wick traders, ranked on settled and closed trades.</p></div>
      <div className="ctl">
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Period" value={period} onChange={setPeriod}
          options={[{ value: "24h", label: "24h" }, { value: "7d", label: "7d" }, { value: "30d", label: "30d" }, { value: "all", label: "All time" }]} />
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Rank by" value={by} onChange={setBy}
          options={[{ value: "pnl", label: "PnL" }, { value: "volume", label: "Volume" }]} />
      </div>
    </div>
    <section className="p me" aria-label="Your rank">
      <div><span>Your rank</span><b className="rk">—</b></div>
      <div><span>PnL</span><b>—</b></div>
      <div><span>Volume</span><b>—</b></div>
      <div><span>Win rate</span><b>—</b></div>
      <div><span>Wallet</span><b>{owner ? compactAddress(owner) : "Not connected"}</b></div>
    </section>
    <section className="p" style={{ overflowX: "auto" }}>
      <table className="lbt">
        <thead><tr><th>Rank</th><th>Trader</th><th>{by === "pnl" ? "PnL" : "Volume"}</th><th>ROI</th><th>{by === "pnl" ? "Volume" : "PnL"}</th><th>Win rate</th><th>Trades</th><th>Favourite market</th></tr></thead>
        <tbody><tr><td colSpan={8} className="nodata">No data yet. Rankings appear here once trader results are indexed.</td></tr></tbody>
      </table>
    </section>
  </div>;
}
