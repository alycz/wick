import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  afterEach(cleanup);

  it("introduces Wick without presenting illustrative market values as live data", () => {
    render(<LandingPage />);

    expect(screen.getByRole("heading", { name: /Every strike.*One fair surface/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /A prediction market risk engine/i }).querySelector("br")).toBeNull();
    expect(screen.getByText(/Live values appear only when the backend is healthy and fresh/i)).toBeInTheDocument();
    expect(screen.getByText(/No invented liquidity/i)).toBeInTheDocument();
    expect(screen.queryByText(/Live BTC/i)).not.toBeInTheDocument();
  });

  it("links the primary product paths", () => {
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: /Open trading terminal/i })).toHaveAttribute("href", "/trade");
    expect(screen.getByRole("link", { name: /Explore the pool/i })).toHaveAttribute("href", "/pool");
    expect(screen.getAllByRole("link", { name: /terminal|markets|ladder/i }).some((link) => link.getAttribute("href") === "/trade")).toBe(true);
  });
});
