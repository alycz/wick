import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import type { PricerMarket } from "@wick/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  markets: { markets: [] as PricerMarket[], loading: false, error: undefined as string | undefined },
  health: {} as Record<string, unknown>,
  actions: {} as Record<string, unknown>,
  openPosition: vi.fn(),
}));

vi.mock("@/hooks/use-markets", () => ({
  useMarkets: () => state.markets,
  useHealth: () => state.health,
  useMarketHistory: () => ({ history: [
    { ts: Date.now() - 60_000, spot: 65_000, theo: .55, geminiMid: .54 },
    { ts: Date.now() - 30_000, spot: 65_125, theo: .61, geminiMid: .61 },
  ] }),
}));
vi.mock("@/hooks/use-wick-actions", () => ({ useWickActions: () => state.actions }));
vi.mock("@/components/wick-chart", () => ({ WickChart: () => <div data-testid="chart" /> }));
vi.mock("@/lib/api", async (original) => ({ ...(await original<typeof import("@/lib/api")>()), liveBackend: () => true }));

import { MarketsPage } from "@/components/markets/markets-page";

const now = Date.now();
const base = {
  eventTicker: "BTC1D", openTs: now - 60_000, spot: 65_125, status: "open" as const, volSource: "deribit" as const,
};
const ladder: PricerMarket[] = [64_000, 65_000, 66_000].map((strike, index) => ({
  ...base, symbol: `BTC-1D-${strike}`, kind: "ladder", duration: "1d", title: `BTC above ${strike}`, strike,
  expiryTs: now + 86_400_000, theo: [.75, .61, .4][index]!,
  gemini: { bid: .59, ask: .63, mid: .61, last: .6, ts: now }, edge: .01, maxLeverage: 4,
}));
const upDown: PricerMarket = {
  ...base, symbol: "BTC-15M-UP", kind: "up_down", duration: "15m", title: "BTC up?", strike: 65_000,
  expiryTs: now + 600_000, theo: .55, gemini: { bid: .53, ask: .57, mid: .55, ts: now }, edge: 0, maxLeverage: 42,
};

describe("MarketsPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    state.markets = { markets: [upDown, ...ladder], loading: false, error: undefined };
    state.health = { health: { ok: true, chainConfigured: true, volHealthy: true, volSource: "deribit", markAgeMs: 1_000 } };
    state.actions = { client: undefined, error: "Trading backend unavailable." };
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("explains an unconfigured backend instead of showing markets", () => {
    state.markets = { markets: [], loading: false, error: "Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL to load live markets." };
    render(<MarketsPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/Backend is not configured/);
  });

  it("opens in Pro with the strike chain, Gemini's top of book and no invented depth", () => {
    render(<MarketsPage />);
    expect(screen.getByRole("button", { name: "Pro" })).toHaveAttribute("aria-pressed", "true");
    const chain = screen.getByRole("region", { name: "Strike chain" });
    expect(within(chain).getByText("$65,000")).toBeInTheDocument();
    const quote = screen.getByRole("region", { name: "Gemini quote" });
    expect(within(quote).getByText("63.0")).toBeInTheDocument();
    expect(screen.queryByText(/order book/i)).not.toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Trading backend unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Yes/ })).toBeDisabled();
  });

  it("marks prices stale when the confirmed mark is old", () => {
    state.health = { health: { ok: true, chainConfigured: true, volHealthy: true, volSource: "deribit", markAgeMs: 10_001 } };
    render(<MarketsPage />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("submits a real NO position, capped at the market's leverage", async () => {
    state.openPosition.mockResolvedValue("verified-signature-123456");
    state.actions = { client: { openPosition: state.openPosition } };
    render(<MarketsPage symbol="BTC-1D-65000" />);
    fireEvent.click(screen.getByRole("button", { name: /^No / }));
    fireEvent.click(screen.getByRole("button", { name: /Open No/ }));
    await waitFor(() => expect(state.openPosition).toHaveBeenCalledWith(expect.objectContaining({
      symbol: "BTC-1D-65000", side: "no", marginE6: 25_000_000n, leverage: 4,
    })));
    expect(await screen.findByText(/Position opened/)).toBeInTheDocument();
  });

  it("switches to Easy and remembers it", () => {
    render(<MarketsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Easy" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Bitcoin above/);
    expect(window.localStorage.getItem("wick:markets-mode")).toBe("easy");
  });
});
