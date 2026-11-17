import { cleanup, render, screen } from "@testing-library/react";
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
    render(<Shell><div>Landing</div></Shell>);

    expect(screen.getByRole("link", { name: "Wick markets home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Trade" })).toHaveAttribute("href", "/trade");
    expect(screen.queryByText("Activity feed")).not.toBeInTheDocument();
  });

  it("marks the terminal active and retains honest activity provenance on platform routes", () => {
    pathnameMock.mockReturnValue("/trade");
    render(<Shell><div>Terminal</div></Shell>);

    expect(screen.getByRole("link", { name: "Trade" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Activity feed")).toBeInTheDocument();
    expect(screen.getByText("Solana devnet")).toBeInTheDocument();
  });
});
