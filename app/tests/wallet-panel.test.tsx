import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const healthState = vi.hoisted(() => ({
  value: {} as { health?: { chainConfigured: boolean }; error?: string },
}));

vi.mock("next/dynamic", () => ({
  default: () => function MockWalletButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button type="button" {...props}>{children}</button>;
  },
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

  it("hydrates as one wallet entry with both wallet choices and no unavailable funding action", () => {
    render(<DemoWalletProvider><WalletPanel /></DemoWalletProvider>);
    const entry = screen.getByRole("button", { name: "Wallet" });

    expect(entry).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Create test wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect browser wallet" })).not.toBeInTheDocument();
    fireEvent.click(entry);
    expect(screen.getByRole("dialog", { name: "Wallet options" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create test wallet/i })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Connect browser wallet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Faucet" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(entry).toHaveFocus();
  });

  it("restores faucet access only after the backend verifies chain execution", () => {
    healthState.value = { health: { chainConfigured: true } };
    render(<DemoWalletProvider><WalletPanel /></DemoWalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Wallet" }));
    fireEvent.click(screen.getByRole("button", { name: /Create test wallet/i }));

    expect(screen.getByRole("button", { name: "Faucet" })).toBeInTheDocument();
  });
});
