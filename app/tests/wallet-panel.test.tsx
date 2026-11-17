import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const healthState = vi.hoisted(() => ({
  value: {} as { health?: { chainConfigured: boolean }; error?: string },
}));

vi.mock("next/dynamic", () => ({
  default: () => function MockWalletButton() { return <button type="button">Select Wallet</button>; },
}));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => ({ publicKey: undefined }) }));
vi.mock("@/hooks/use-markets", () => ({ useHealth: () => healthState.value }));

import { DemoWalletProvider, WalletPanel } from "@/components/wallet-panel";

describe("WalletPanel availability", () => {
  beforeEach(() => {
    window.localStorage.clear();
    healthState.value = { error: "Backend is not configured." };
  });
  afterEach(cleanup);

  it("uses one concise test-wallet action and hides funding while execution is unavailable", () => {
    render(<DemoWalletProvider><WalletPanel /></DemoWalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Create test wallet" }));

    expect(screen.getByRole("status", { name: "Local test wallet" })).toBeInTheDocument();
    expect(screen.queryByText(/Demo · devnet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Faucet" })).not.toBeInTheDocument();
  });

  it("restores faucet access only after the backend verifies chain execution", () => {
    healthState.value = { health: { chainConfigured: true } };
    render(<DemoWalletProvider><WalletPanel /></DemoWalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Create test wallet" }));

    expect(screen.getByRole("button", { name: "Faucet" })).toBeInTheDocument();
  });
});
