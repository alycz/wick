import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => ({}) }));
vi.mock("@/components/wallet-panel", () => ({ useDemoWallet: () => ({}) }));
vi.mock("@/hooks/use-feed", () => ({ useFeed: () => ({ events: [] }) }));
vi.mock("@/hooks/use-markets", () => ({ useMarkets: () => ({ markets: [], loading: false }) }));
vi.mock("@/hooks/use-wick-actions", () => ({ useWickActions: () => ({ demo: true, client: { closePosition: vi.fn(), settlePosition: vi.fn(), claimQueue: vi.fn() } }) }));
vi.mock("@/lib/api", () => ({ backendConfigured: () => false, getPositions: vi.fn(), getClaims: vi.fn() }));
vi.mock("@/components/demo-account", () => ({
  useDemoAccount: () => ({
    ledger: {
      version: 2, owner: "LegacyOwner", createdTs: 1000, usdcE6: "9123000000", wickedE6: "1250000000", stakedE6: "0", rewardsE6: "0", rewardsTs: 2000,
      legacyMigration: { sourceVersion: 1, migratedTs: 2000, seededExamples: true, legacySyntheticRewardsE6: "400000" },
      positions: [{
        address: "demo-position-legacy-rs-0", owner: "LegacyOwner", market: "BTC-DEMO-95000", side: "yes", marginE6: "250000000", leverage: 3,
        entryE6: 580000, contractsE6: "1293103448", liqMarkE6: 290000, status: "settled", realizedPnlE6: "10000000", paidE6: "260000000",
        openedTs: 1000, closedTs: 2000, legacyUnverified: true,
        snapshot: { symbol: "BTC-DEMO-95000", kind: "ladder", duration: "1d", title: "Legacy example", strike: 95000, expiryTs: 2000 },
      }],
      claims: [{ address: "demo-claim-legacy-rs-0", claimIndex: "1", owner: "LegacyOwner", amountE6: "64180000", paidE6: "21400000", status: "queued", legacyUnverified: true }],
      activity: [],
    },
  }),
}));

import PortfolioPage from "@/app/portfolio/page";

afterEach(cleanup);

describe("PortfolioPage migrated browser practice", () => {
  it("keeps migrated records visible in history and the payout queue", () => {
    render(<PortfolioPage />);
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("BTC > $95k")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Payout queue/ }));
    expect(screen.getByText("#1")).toBeInTheDocument();
  });
});
