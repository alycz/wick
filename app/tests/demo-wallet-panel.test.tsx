import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => function MockWalletButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
    return <button type="button" {...props}>{children}</button>;
  },
}));
vi.mock("@solana/wallet-adapter-react", () => ({ useWallet: () => ({ publicKey: undefined }) }));
vi.mock("@/hooks/use-markets", () => ({ useHealth: () => ({}), useMarkets: () => ({ markets: [], loading: false }) }));

import { DemoAccountProvider } from "@/components/demo-account";
import { DemoWalletProvider, WalletPanel } from "@/components/wallet-panel";

const app = () => render(<DemoWalletProvider><DemoAccountProvider><WalletPanel /></DemoAccountProvider></DemoWalletProvider>);

describe("WalletPanel demo account", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows a $10,000 demo balance next to Connect wallet before any wallet is connected", async () => {
    app();
    expect(await screen.findByRole("button", { name: "Demo account, $10,000.00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });

  it("deposits into and withdraws from the demo balance", async () => {
    app();
    fireEvent.click(await screen.findByRole("button", { name: "Demo account, $10,000.00" }));
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Deposit" }).at(-1)!);
    expect(await screen.findByText(/Deposited \$250\.00/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demo account, $10,250.00" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Withdraw" })[0]!);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Send to"), { target: { value: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Withdraw" }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo account, $10,200.00" })).toBeInTheDocument(), { timeout: 3000 });
    expect(JSON.parse(window.localStorage.getItem("wick-demo-account-v1")!).usdcE6).toBe("10200000000");
  });
});
