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
import { DEMO_LEGACY_BACKUP_KEY, DEMO_STORAGE_KEY } from "@/lib/demo/ledger";

const app = () => render(<DemoWalletProvider><DemoAccountProvider><WalletPanel /></DemoAccountProvider></DemoWalletProvider>);

describe("WalletPanel demo account", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("shows a $10,000 demo balance next to Connect wallet before any wallet is connected", async () => {
    app();
    expect(await screen.findByRole("button", { name: "Demo account, $10,000.00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeInTheDocument();
  });

  it("backs up and migrates version-1 browser data instead of discarding it", async () => {
    const legacy = JSON.stringify({
      version: 1, owner: "LegacyOwner", createdTs: 1000, usdcE6: "9123000000", wickedE6: "1250000000", stakedE6: "0",
      rewardsE6: "400000", rewardsTs: 1000, nextClaimIndex: 1, seeded: true, positions: [], claims: [], activity: [],
    });
    window.localStorage.setItem(DEMO_STORAGE_KEY, legacy);

    app();

    expect(await screen.findByRole("button", { name: "Demo account, $9,123.00" })).toBeInTheDocument();
    expect(window.localStorage.getItem(DEMO_LEGACY_BACKUP_KEY)).toBe(legacy);
    const migrated = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY)!);
    expect(migrated).toMatchObject({ version: 2, usdcE6: "9123000000", rewardsE6: "0" });
    expect(migrated.legacyMigration).toMatchObject({ sourceVersion: 1, legacySyntheticRewardsE6: "400000" });
  });

  it("deposits into and withdraws from the demo balance", async () => {
    app();
    fireEvent.click(await screen.findByRole("button", { name: "Demo account, $10,000.00" }));
    fireEvent.click(screen.getByRole("button", { name: "Deposit" }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "250" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Deposit" }).at(-1)!);
    expect(await screen.findByText(/Local demo balance increased \$250\.00 · demo-receipt-.* · no network transfer/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Deposit" })).toHaveTextContent(/NetworkLocal browser/);
    expect(screen.getByRole("dialog", { name: "Deposit" })).not.toHaveTextContent(/real USDC/i);
    expect(screen.getByRole("button", { name: "Demo account, $10,250.00" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Withdraw" })[0]!);
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "50" } });
    fireEvent.change(screen.getByLabelText("Send to"), { target: { value: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Withdraw" }).at(-1)!);
    await waitFor(() => expect(screen.getByRole("button", { name: "Demo account, $10,200.00" })).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByRole("status")).toHaveTextContent(/Local demo balance decreased \$50\.00.*no network transfer/);
    expect(JSON.parse(window.localStorage.getItem("wick-demo-account-v1")!).usdcE6).toBe("10200000000");
  });
});
