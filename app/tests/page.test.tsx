import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPage from "@/app/page";

const markets = { markets: [], loading: false };
const history = { history: [] };
vi.mock("@/hooks/use-markets", () => ({ useMarkets: () => markets, useMarketHistory: () => history }));

describe("LandingPage", () => {
  afterEach(cleanup);

  it("shows the redesigned hero without inventing market values", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /Every Bitcoin strike, priced fairly/i })).toBeInTheDocument();
    expect(screen.getByText(/Strikes appear here when live prices load/i)).toBeInTheDocument();
    expect(screen.getByText(/Live BTC chart appears when prices load/i)).toBeInTheDocument();
  });

  it("links the primary product paths", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "Start trading" })).toHaveAttribute("href", "/trade");
    expect(screen.getByRole("link", { name: "See the pool" })).toHaveAttribute("href", "/pool");
    expect(screen.getByRole("link", { name: /Open the strike ladder/i })).toHaveAttribute("href", "/trade");
  });
});
