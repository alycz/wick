import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));
vi.mock("@/components/wallet-panel", () => ({ WalletPanel: () => <div>Wallet controls</div> }));
vi.mock("@/components/activity-rail", () => ({ ActivityRail: () => <aside>Activity feed</aside> }));

import { Shell } from "@/components/shell";

afterEach(() => {
  cleanup();
  pathnameMock.mockReset();
});

describe("Shell navigation", () => {
  it("links the brand home and Trade to the terminal without showing the activity rail on the landing page", () => {
    pathnameMock.mockReturnValue("/");
    const { container } = render(<Shell><div>Landing</div></Shell>);

    expect(screen.getByRole("link", { name: "Wick markets home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: /Trade/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Activity feed")).not.toBeInTheDocument();
    expect(container.querySelector(".chrome-shell")).not.toHaveClass("site-shell");
    expect(container.querySelector(".chrome-topbar")).not.toHaveClass("topbar");
    expect(container.querySelector(".chrome-app-grid")).not.toHaveClass("app-grid");
  });

  it("marks the terminal active and retains honest activity provenance on platform routes", () => {
    pathnameMock.mockReturnValue("/trade");
    render(<Shell><div>Terminal</div></Shell>);

    expect(screen.getByRole("button", { name: /Trade/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Activity feed")).toBeInTheDocument();
    expect(screen.getByText("Solana devnet")).toBeInTheDocument();
  });

  it("opens the Trade destination menu with keyboard navigation and restores focus on Escape", async () => {
    pathnameMock.mockReturnValue("/");
    render(<Shell><div>Landing</div></Shell>);
    const trade = screen.getByRole("button", { name: /Trade/ });

    fireEvent.keyDown(trade, { key: "ArrowDown" });
    const btc = await screen.findByRole("menuitem", { name: /BTC.*15 minute markets/i });
    const tail = screen.getByRole("menuitem", { name: /Tail.*Strike ladder/i });
    const lp = screen.getByRole("menuitem", { name: /LP.*Experimental pool/i });
    expect(btc).toHaveAttribute("href", "/trade");
    expect(tail).toHaveAttribute("href", "/trade#tail-ladder");
    expect(lp).toHaveAttribute("href", "/pool");
    await waitFor(() => expect(btc).toHaveFocus());
    fireEvent.keyDown(btc, { key: "ArrowDown" });
    expect(tail).toHaveFocus();
    fireEvent.keyDown(tail, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trade).toHaveFocus();
  });
});
