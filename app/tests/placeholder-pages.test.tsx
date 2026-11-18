import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const marketState = { markets: [], loading: false };
const feedState = { events: [] };
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => ({}) }));
vi.mock("@/components/wallet-panel", () => ({ useDemoWallet: () => ({}) }));
vi.mock("@/hooks/use-markets", () => ({ useMarkets: () => marketState }));
vi.mock("@/hooks/use-feed", () => ({ useFeed: () => feedState }));
vi.mock("@/components/wick-chart", () => ({ WickChart: () => <div /> }));
const sim = { on: false };
vi.mock("@/lib/api", () => ({ backendConfigured: () => true, liveBackend: () => true, getLpHistory: async () => [] }));
vi.mock("@/components/demo-account", () => ({ useShowSimulated: () => sim.on, useDemoAccount: () => undefined }));

import LeaderboardPage from "@/app/leaderboard/page";
import StatsPage from "@/app/stats/page";

afterEach(() => { cleanup(); sim.on = false; });

describe("pages without backend data yet", () => {
  it("shows the leaderboard frame with a no-data row instead of invented traders", () => {
    render(<LeaderboardPage />);
    expect(screen.getByRole("heading", { name: "Leaderboard" })).toBeInTheDocument();
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("shows stats placeholders for every metric the backend can't report", () => {
    render(<StatsPage />);
    expect(screen.getByRole("heading", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getAllByText(/No data yet/).length).toBeGreaterThanOrEqual(6);
  });

  it("fills the leaderboard and stats with simulated data on demo data", () => {
    sim.on = true;
    render(<LeaderboardPage />);
    expect(screen.queryByText(/No data yet/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(20);
    cleanup();
    const { container } = render(<StatsPage />);
    expect(screen.getByText("Trades")).toBeInTheDocument();
    expect(container.querySelectorAll(".liqs .lr").length).toBe(6);
  });
});
