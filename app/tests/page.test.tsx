import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import type { PricerMarket } from "@wick/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  markets: { markets: [] as PricerMarket[], loading: false, error: undefined as string | undefined },
  health: {} as Record<string, unknown>,
}));

vi.mock("@/hooks/use-markets", () => ({
  useMarkets: () => state.markets,
  useHealth: () => state.health,
}));

import MarketsPage from "@/app/page";

const now = 2_000_000_000_000;
const hero: PricerMarket = {
  symbol: "GEMI-BTC15M-UP", eventTicker: "BTC15M", kind: "up_down", duration: "15m", title: "BTC up?",
  strike: 65_000, openTs: now - 60_000, expiryTs: now + 600_000, spot: 65_100, theo: 0.55,
  gemini: { bid: 0.53, ask: 0.57, mid: 0.55, ts: now - 1_000 }, edge: 0, maxLeverage: 4, status: "open", volSource: "deribit",
};

describe("MarketsPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    state.markets = { markets: [], loading: false, error: undefined };
    state.health = {};
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("marks the hero unavailable when the backend is not configured", () => {
    state.markets.error = "Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL to load live markets.";
    state.health = { error: "Backend health unavailable until NEXT_PUBLIC_BACKEND_URL is configured." };
    render(<MarketsPage />);
    expect(screen.getByRole("heading", { name: /Every Gemini strike/i })).toBeInTheDocument();
    expect(screen.getByText(/Backend is not configured/)).toBeInTheDocument();
    expect(screen.getByText(/BTC unavailable · 15 minute/)).toBeInTheDocument();
    expect(screen.queryByText(/Live BTC · 15 minute/)).not.toBeInTheDocument();
    expect(screen.getByText(/No verified live BTC 15-minute market/)).toBeInTheDocument();
  });

  it("marks the hero loading while the initial market request is pending", () => {
    state.markets.loading = true;
    render(<MarketsPage />);
    expect(screen.getByText(/Loading BTC · 15 minute/)).toBeInTheDocument();
    expect(screen.queryByText(/Live BTC · 15 minute/)).not.toBeInTheDocument();
  });

  it("shows LIVE only for a healthy backend with fresh marks and Gemini quotes", () => {
    state.markets.markets = [hero];
    state.health = { health: { ok: true, chainConfigured: true, volHealthy: true, volSource: "deribit", markAgeMs: 1_000 } };
    render(<MarketsPage />);
    expect(screen.getByText(/Live BTC · 15 minute/)).toBeInTheDocument();
  });

  it("marks an otherwise healthy market stale when its confirmed mark is old", () => {
    state.markets.markets = [hero];
    state.health = { health: { ok: true, chainConfigured: true, volHealthy: true, volSource: "deribit", markAgeMs: 10_001 } };
    render(<MarketsPage />);
    expect(screen.getByText(/Stale BTC · 15 minute/)).toBeInTheDocument();
    expect(screen.queryByText(/Live BTC · 15 minute/)).not.toBeInTheDocument();
  });
});
