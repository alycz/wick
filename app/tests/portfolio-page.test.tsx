import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ closePosition: vi.fn(), claimQueue: vi.fn(), push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => ({}) }));
vi.mock("@/components/wallet-panel", () => ({ useDemoWallet: () => ({ publicKey: "Owner111111111111111111111111111111111111111" }) }));
vi.mock("@/hooks/use-feed", () => ({ useFeed: () => feedState }));
const feedState = { events: [] };
const marketState = { markets: [], loading: false };
vi.mock("@/hooks/use-markets", () => ({ useMarkets: () => marketState }));
vi.mock("@/hooks/use-wick-actions", () => ({ useWickActions: () => ({ client: { closePosition: mocks.closePosition, claimQueue: mocks.claimQueue } }) }));
vi.mock("@/lib/api", () => ({
  backendConfigured: () => true,
  getPositions: async () => [
    { address: "PosOpen1", owner: "o", market: "MarketAddr1", side: "yes", marginE6: "100000000", leverage: 20, entryE6: 540000, contractsE6: "3703703703", liqMarkE6: 513000, status: "open" },
    { address: "PosDone1", owner: "o", market: "MarketAddr2", side: "no", marginE6: "50000000", leverage: 5, entryE6: 610000, contractsE6: "409836065", liqMarkE6: 490000, status: "settled", realizedPnlE6: "61250000" },
  ],
  getClaims: async () => [{ address: "Claim1", claimIndex: "17", owner: "o", amountE6: "111250000", paidE6: "40000000", status: "queued" }],
}));

import PortfolioPage from "@/app/portfolio/page";

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("PortfolioPage", () => {
  it("summarises positions and queued payouts and closes through the real client", async () => {
    mocks.closePosition.mockResolvedValue("closeSignature123456");
    render(<PortfolioPage />);
    expect(await screen.findByText("YES 20x")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.getByText("+$61.25")).toBeInTheDocument();
    expect(screen.getByText("$71.25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(mocks.closePosition).toHaveBeenCalledWith(expect.objectContaining({ address: "PosOpen1" }), 10_000));
    expect(await screen.findByText(/Devnet transaction confirmed/)).toBeInTheDocument();
  });

  it("lists claims in the payout queue tab", async () => {
    render(<PortfolioPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Payout queue/ }));
    expect(screen.getByText("#17")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Claim" })).toBeEnabled();
  });
});
