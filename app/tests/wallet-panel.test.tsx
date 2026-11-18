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

  it("starts as one connect button with both wallet choices and no unavailable funding action", () => {
    render(<DemoWalletProvider><WalletPanel /></DemoWalletProvider>);
    const entry = screen.getByRole("button", { name: "Connect wallet" });

    expect(entry).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /Create a local wallet/i })).not.toBeInTheDocument();
    fireEvent.click(entry);
    expect(screen.getByRole("dialog", { name: "Wallet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect Phantom or Solflare" })).toHaveFocus();
    expect(screen.getByRole("button", { name: /Create a local wallet/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add funds" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(entry).toHaveFocus();
  });

  it("offers Add funds only after the backend verifies chain execution", () => {
    healthState.value = { health: { chainConfigured: true } };
    render(<DemoWalletProvider><WalletPanel /></DemoWalletProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    fireEvent.click(screen.getByRole("button", { name: /Create a local wallet/i }));

    expect(screen.getByRole("button", { name: "Add funds" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove local wallet" })).toBeInTheDocument();
  });
});
