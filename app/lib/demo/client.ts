import type { PricerMarket } from "@wick/shared";
import type { ClaimActionInput, OpenPositionInput, PositionActionInput, WickBrowserClient } from "@/lib/chain";
import * as ledger from "./ledger";
import type { DemoLedger } from "./ledger";

/* What the UI calls to act on an account. The real client signs DevNet transactions; the demo client
   applies the same actions to the browser ledger. */
export type WickClient = Pick<WickBrowserClient, "openPosition" | "closePosition" | "settlePosition" | "claimQueue" | "stake" | "unstake" | "claimRewards">;

export interface DemoStore {
  read(): DemoLedger;
  write(next: DemoLedger): void;
  markets(): readonly PricerMarket[];
}

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export class DemoClient implements WickClient {
  constructor(private readonly store: DemoStore, private readonly latencyMs = 650, private readonly now: () => number = Date.now) {}

  /* a short pause like a confirmed transaction, then the ledger update */
  private async apply(operation: (current: DemoLedger, now: number) => { ledger: DemoLedger; receiptId: string }): Promise<string> {
    if (this.latencyMs > 0) await wait(this.latencyMs * (0.7 + Math.random() * 0.6));
    const result = operation(this.store.read(), this.now());
    this.store.write(result.ledger);
    return result.receiptId;
  }

  private market(symbol: string): PricerMarket | undefined { return this.store.markets().find((market) => market.symbol === symbol); }

  /* trades fill at the price on screen when the button was pressed, like a transaction built from that quote */
  openPosition(input: OpenPositionInput): Promise<string> {
    const market = this.market(input.symbol);
    return this.apply((current, now) => {
      if (!market) throw new ledger.DemoError("This market isn't available right now.");
      return ledger.openPosition(current, market, input, now);
    });
  }
  closePosition(input: PositionActionInput, minExitE6: number): Promise<string> {
    const market = this.market(input.market);
    return this.apply((current, now) => ledger.closePosition(current, input.address, market, minExitE6, now));
  }
  settlePosition(input: PositionActionInput): Promise<string> {
    return this.apply((current, now) => ledger.settlePosition(current, input.address, undefined, now));
  }
  claimQueue(input: ClaimActionInput): Promise<string> { return this.apply((current, now) => ledger.claimQueue(current, input.address, now)); }
  stake(amountE6: bigint): Promise<string> { return this.apply((current, now) => ledger.stake(current, amountE6, now)); }
  unstake(amountE6: bigint): Promise<string> { return this.apply((current, now) => ledger.unstake(current, amountE6, now)); }
  claimRewards(): Promise<string> { return this.apply((current, now) => ledger.claimRewards(current, now)); }

  deposit(amountE6: bigint, kind: "deposit" | "faucet" = "deposit"): Promise<string> { return this.apply((current, now) => ledger.deposit(current, amountE6, now, kind)); }
  withdraw(amountE6: bigint, to: string): Promise<string> { return this.apply((current, now) => ledger.withdraw(current, amountE6, to, now)); }
}
