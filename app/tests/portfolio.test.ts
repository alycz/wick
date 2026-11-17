// @vitest-environment node

import type { PositionView, PricerMarket } from "@wick/shared";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { latestIndexerEventKey } from "@/lib/feed";
import { calculateLivePositionPnls, livePositionPnlE6 } from "@/lib/portfolio";

const market: PricerMarket = {
  symbol: "GEMI-BTC15M-UP", eventTicker: "BTC15M", kind: "up_down", duration: "15m", title: "BTC up",
  strike: 100_000, openTs: 1, expiryTs: 2, spot: 100_000, theo: 0.6,
  gemini: { ts: 1 }, maxLeverage: 4, status: "open", volSource: "deribit",
};

function position(side: "yes" | "no"): PositionView {
  return {
    address: `position-${side}`, owner: "owner", market: "market", side,
    marginE6: "10000000", leverage: 1, entryE6: 500_000, contractsE6: "100000000",
    liqMarkE6: 0, status: "open",
  };
}

describe("portfolio live data", () => {
  it("calculates YES and NO PnL from the real live mark using shared fixed-point math", () => {
    expect(livePositionPnlE6(position("yes"), market)).toBe(10_000_000n);
    expect(livePositionPnlE6(position("no"), market)).toBe(-10_000_000n);
  });

  it("maps a live pricer market to its on-chain PDA before calculating PnL", async () => {
    const programId = Keypair.generate().publicKey;
    const digest = createHash("sha256").update(market.symbol).digest();
    const marketAddress = PublicKey.findProgramAddressSync([Buffer.from("market"), digest], programId)[0].toBase58();
    const value = await calculateLivePositionPnls([{ ...position("yes"), market: marketAddress }], [market], programId.toBase58());
    expect(value.get("position-yes")).toBe(10_000_000n);
  });

  it("selects the newest relevant portfolio and pool events while ignoring market ticks", () => {
    const events = [{ signature: "quote", eventIndex: 0, slot: 2, blockTime: 2, name: "MarksUpdated", data: {}, provenance: "quicknode_stream" as const },
      { signature: "pool", eventIndex: 0, slot: 2, blockTime: 2, name: "LpUpdated", data: {}, provenance: "quicknode_stream" as const },
      { signature: "position", eventIndex: 1, slot: 1, blockTime: 1, name: "PositionSettled", data: {}, provenance: "quicknode_stream" as const }];
    expect(latestIndexerEventKey(events, new Set(["PositionSettled", "ClaimPaid"]))).toBe("position:1");
    expect(latestIndexerEventKey(events, new Set(["LpUpdated"]))).toBe("pool:0");
    expect(latestIndexerEventKey(events, new Set(["ClaimPaid"]))).toBe("");
  });
});
