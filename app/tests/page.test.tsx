import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-markets", () => ({
  useMarkets: () => ({ markets: [], loading: false, error: "Backend is not configured. Set NEXT_PUBLIC_BACKEND_URL to load live markets." }),
  useHealth: () => ({ error: "Backend health unavailable until NEXT_PUBLIC_BACKEND_URL is configured." }),
}));

import MarketsPage from "@/app/page";

describe("MarketsPage", () => {
  it("renders exact product and safety copy without fabricated markets", () => {
    render(<MarketsPage />);
    expect(screen.getByRole("heading", { name: /Every Gemini strike/i })).toBeInTheDocument();
    expect(screen.getByText(/Backend is not configured/)).toBeInTheDocument();
    expect(screen.getByText(/No verified live BTC 15-minute market/)).toBeInTheDocument();
  });
});
