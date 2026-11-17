import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  afterEach(cleanup);

  it("introduces Wick without presenting illustrative market values as live data", () => {
    const { container } = render(<LandingPage />);

    expect(screen.getByRole("heading", { name: /Every strike.*One fair surface/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /A prediction market risk engine/i }).querySelector("br")).toBeNull();
    expect(screen.getByText(/Live state appears after health checks pass/i)).toBeInTheDocument();
    expect(screen.getByText(/No invented liquidity/i)).toBeInTheDocument();
    expect(screen.queryByText(/Live BTC/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".landing-kicker > span:not(.wick-logo-mark)")).toHaveLength(0);
    expect(container.querySelector(".landing-terminal-kicker .wick-logo-mark")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /model extends across tail strikes/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /gamma rises.*leverage cap falls/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Trading losses flow into the experimental vault/i })).toBeInTheDocument();
  });

  it("links the primary product paths", () => {
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: /Open trading terminal/i })).toHaveAttribute("href", "/trade");
    expect(screen.getByRole("link", { name: /Explore the pool/i })).toHaveAttribute("href", "/pool");
    expect(screen.getAllByRole("link", { name: /terminal|markets|ladder/i }).some((link) => link.getAttribute("href") === "/trade")).toBe(true);
  });
});
