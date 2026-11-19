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
vi.mock("@/lib/api", () => ({ backendConfigured: () => false, getLpHistory: async () => [] }));

import LeaderboardPage from "@/app/leaderboard/page";
import StatsPage from "@/app/stats/page";

afterEach(cleanup);

describe("pages without backend data yet", () => {
  it("shows the leaderboard frame with a no-data row instead of invented traders", () => {
    render(<LeaderboardPage />);
    expect(screen.getByText(/No data yet/)).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(2);
  });

  it("shows stats placeholders for every metric the backend can't report", () => {
    render(<StatsPage />);
    expect(screen.getAllByText(/No data yet/).length).toBeGreaterThanOrEqual(6);
  });
});
