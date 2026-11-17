import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openPosition: vi.fn(),
  useMarket: vi.fn(),
  useMarketHistory: vi.fn(),
  useWickActions: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ symbol: "BTC-15M-UP" }) }));
vi.mock("@/hooks/use-markets", () => ({ useMarket: mocks.useMarket, useMarketHistory: mocks.useMarketHistory }));
vi.mock("@/hooks/use-wick-actions", () => ({ useWickActions: mocks.useWickActions }));

import TradePage from "@/app/m/[symbol]/page";

const market = {
  symbol: "BTC-15M-UP",
  eventTicker: "BTC15M",
  kind: "up_down" as const,
  duration: "15m",
  title: "Will BTC close above the strike?",
  strike: 65_000,
  openTs: 1_700_000_000_000,
  expiryTs: 1_700_000_900_000,
  spot: 65_125,
  theo: .61,
  gemini: { bid: .59, ask: .63, mid: .61, last: .6, ts: 1_700_000_000_000 },
  edge: .01,
  maxLeverage: 4,
  status: "open" as const,
  volSource: "deribit" as const,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TradePage", () => {
  it("shows verified quotes without inventing order-book depth and keeps an unavailable backend disabled", () => {
    mocks.useMarket.mockReturnValue({ market, loading: false });
    mocks.useMarketHistory.mockReturnValue({ history: [
      { ts: 1, spot: 65_000, theo: .55, geminiMid: .54 },
      { ts: 2, spot: 65_125, theo: .61, geminiMid: .61 },
    ] });
    mocks.useWickActions.mockReturnValue({ client: undefined, error: "Trading backend unavailable." });

    render(<TradePage />);

    expect(screen.getByRole("heading", { name: "Market quotes" })).toBeInTheDocument();
    expect(screen.getByText("63.0¢")).toBeInTheDocument();
    expect(screen.getByText("Trading backend unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open YES/ })).toBeDisabled();
    expect(screen.queryByText(/order book/i)).not.toBeInTheDocument();
  });

  it("preserves the real NO position submission path", async () => {
    mocks.openPosition.mockResolvedValue("verified-devnet-signature");
    mocks.useMarket.mockReturnValue({ market, loading: false });
    mocks.useMarketHistory.mockReturnValue({ history: [
      { ts: 1, spot: 65_000, theo: .55 },
      { ts: 2, spot: 65_125, theo: .61 },
    ] });
    mocks.useWickActions.mockReturnValue({ client: { openPosition: mocks.openPosition } });

    render(<TradePage />);
    fireEvent.click(screen.getByRole("button", { name: /NO/ }));
    fireEvent.click(screen.getByRole("button", { name: /Open NO/ }));

    await waitFor(() => expect(mocks.openPosition).toHaveBeenCalledWith(expect.objectContaining({
      symbol: market.symbol,
      side: "no",
      marginE6: 100_000_000n,
      leverage: 1,
    })));
    expect(await screen.findByText(/Confirmed on devnet/)).toBeInTheDocument();
  });
});
