import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
vi.mock("@/components/wallet-panel", () => ({ WalletPanel: () => <div>Wallet controls</div> }));

import { Shell } from "@/components/shell";

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
});

describe("Shell navigation", () => {
  it("links the brand home and lists Markets, Portfolio and Pool", () => {
    pathnameMock.mockReturnValue("/");
    render(<Shell><div>Landing</div></Shell>);

    expect(screen.getByRole("link", { name: "Wick home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("href", "/trade");
    expect(screen.getByRole("link", { name: "Portfolio" })).toHaveAttribute("href", "/portfolio");
    expect(screen.getByRole("link", { name: "Pool" })).toHaveAttribute("href", "/pool");
    expect(screen.getByRole("link", { name: "Markets" })).not.toHaveAttribute("aria-current");
  });

  it("marks Markets current on the terminal and on a market page", () => {
    pathnameMock.mockReturnValue("/trade");
    const { unmount } = render(<Shell><div>Terminal</div></Shell>);
    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
    unmount();

    pathnameMock.mockReturnValue("/m/BTC-UP-15M");
    render(<Shell><div>Market</div></Shell>);
    expect(screen.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the price sources in the footer and no test-money copy", () => {
    pathnameMock.mockReturnValue("/trade");
    render(<Shell><div>Terminal</div></Shell>);

    // no NEXT_PUBLIC_BACKEND_URL in tests, so the footer says the prices are simulated
    expect(screen.getByText("Demo prices: simulated from the Wick pricing model")).toBeInTheDocument();
    expect(screen.queryByText(/devnet|test USDC|real-money/i)).not.toBeInTheDocument();
  });
});
