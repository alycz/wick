import { describe, expect, it } from "vitest";
import { friendlyError } from "@/lib/errors";

describe("friendlyError", () => {
  it("replaces Anchor program errors with a plain sentence", () => {
    const stale = new Error("AnchorError thrown in programs/wick/src/lib.rs:243. Error Code: StaleMark. Error Number: 6006. Error Message: Market mark is stale.");
    expect(friendlyError(stale)).toBe("The price moved while you were confirming. Try again.");
    expect(friendlyError(new Error("failed to send transaction: custom program error: 0x1778"))).toBe("That leverage is above this market's cap. Lower it and try again.");
  });

  it("explains a wallet with no USDC account", () => {
    const missing = new Error("AnchorError caused by account: trader_usdc. Error Code: AccountNotInitialized. Error Number: 3012. Error Message: The program expected this account to be already initialized.");
    expect(friendlyError(missing)).toBe("Add USDC to your wallet first, then try again.");
  });

  it("keeps short messages we wrote and hides raw logs", () => {
    expect(friendlyError(new Error("Stake amount must be positive."))).toBe("Stake amount must be positive.");
    expect(friendlyError(new Error("Program log: Instruction: OpenPosition failed"))).toBe("That didn't go through. Try again.");
    expect(friendlyError(new Error("User rejected the request."))).toBe("You cancelled the request in your wallet.");
  });
});
