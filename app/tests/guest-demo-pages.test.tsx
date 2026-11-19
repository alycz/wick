import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  wallet: {} as { publicKey?: { toBase58: () => string } },
  demoWallet: {} as { publicKey?: string },
  actions: { demo: true, client: {} } as { demo?: boolean; client?: Record<string, unknown>; error?: string },
  account: {
    active: true,
    ready: true,
    ledger: {
      version: 2, owner: "demo-preview-account", createdTs: 1, usdcE6: "10000000000", wickedE6: "0", stakedE6: "0", rewardsE6: "0", rewardsTs: 1,
      positions: [], claims: [], activity: [],
    },
  },
  getPositions: vi.fn(),
  getClaims: vi.fn(),
  getLpHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => mocks.wallet }));
vi.mock("@/components/wallet-panel", () => ({ useDemoWallet: () => mocks.demoWallet }));
vi.mock("@/components/demo-account", () => ({ useDemoAccount: () => mocks.account }));
vi.mock("@/hooks/use-wick-actions", () => ({ useWickActions: () => mocks.actions }));
vi.mock("@/hooks/use-markets", () => ({ useMarkets: () => ({ markets: [], loading: false }) }));
vi.mock("@/hooks/use-feed", () => ({ useFeed: () => ({ events: [] }) }));
vi.mock("@/components/wick-chart", () => ({ WickChart: () => <div data-testid="demo-chart" /> }));
vi.mock("@/lib/api", () => ({
  backendConfigured: () => false,
  getPositions: mocks.getPositions,
  getClaims: mocks.getClaims,
  getLpHistory: mocks.getLpHistory,
}));

import LeaderboardPage from "@/app/leaderboard/page";
import PoolPage from "@/app/pool/page";
import PortfolioPage from "@/app/portfolio/page";
import StatsPage from "@/app/stats/page";

beforeEach(() => {
  mocks.wallet = {};
  mocks.demoWallet = {};
  mocks.actions = { demo: true, client: {} };
  mocks.account.active = true;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("signed-out preview", () => {
  it("shows preview Portfolio positions without loading chain records", () => {
    render(<PortfolioPage />);
    expect(screen.getByText("BTC > $64k")).toBeInTheDocument();
    expect(screen.queryByText(/Example|simulated/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trade" })).toBeEnabled();
    expect(mocks.getPositions).not.toHaveBeenCalled();
  });

  it("shows preview Pool history and activity without loading pool events", () => {
    render(<PoolPage />);
    expect(screen.getByText("$43,820.00")).toBeInTheDocument();
    expect(screen.getByText("4xQm7Rk2…9Kd2Lp")).toBeInTheDocument();
    expect(screen.getByTestId("demo-chart")).toBeInTheDocument();
    expect(screen.queryByText(/Example|simulated/i)).not.toBeInTheDocument();
    expect(mocks.getLpHistory).not.toHaveBeenCalled();
  });

  it("shows preview Leaderboard and Stats with charts for every metric", () => {
    const leaderboard = render(<LeaderboardPage />);
    expect(screen.getByText("kairos.sol")).toBeInTheDocument();
    expect(screen.getByText("#8")).toBeInTheDocument();
    expect(screen.queryByText(/Example|simulated/i)).not.toBeInTheDocument();
    leaderboard.unmount();

    render(<StatsPage />);
    expect(screen.getAllByText("$184,320.00").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("demo-chart")).toHaveLength(4);
    expect(screen.getByText("BTC > $63.75k · Hourly")).toBeInTheDocument();
    expect(screen.queryByText(/Example|simulated|illustrative/i)).not.toBeInTheDocument();
  });

  it("never falls back to preview data for a connected wallet", () => {
    mocks.account.active = false;
    mocks.actions = { error: "Backend unavailable" };
    mocks.wallet = { publicKey: { toBase58: () => "ConnectedWallet11111111111111111111111111111" } };

    const leaderboard = render(<LeaderboardPage />);
    expect(screen.queryByText("kairos.sol")).not.toBeInTheDocument();
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
    leaderboard.unmount();

    render(<StatsPage />);
    expect(screen.queryByText("$184,320.00")).not.toBeInTheDocument();
    expect(screen.getAllByText(/No data yet/).length).toBeGreaterThanOrEqual(6);
  });
});
