// Turns wallet, RPC and Anchor failures into one plain sentence for the UI.
// Raw program logs ("AnchorError thrown in programs/wick/src/lib.rs:243 ...")
// never reach the page.

const PROGRAM_ERRORS: Record<string, string> = {
  Unauthorized: "This wallet can't do that.",
  Paused: "Trading is paused for a moment. Try again shortly.",
  InvalidParameter: "Something in this order isn't valid. Check the amount and try again.",
  InvalidSymbol: "This market isn't available right now.",
  MarketNotOpen: "This market isn't open for trading.",
  MarketCutoff: "This market has closed for new trades.",
  StaleMark: "The price moved while you were confirming. Try again.",
  InvalidPrice: "This price is outside the tradable range.",
  LeverageTooHigh: "That leverage is above this market's cap. Lower it and try again.",
  SlippageExceeded: "The price moved past your limit. Try again.",
  PositionNotOpen: "This position is already closed.",
  NotLiquidatable: "This position can't be liquidated.",
  MarketNotExpired: "This market hasn't expired yet.",
  MarketNotSettled: "This market hasn't settled yet.",
  PoolTooSmall: "The pool can't take this size yet. Lower the leverage or margin.",
  MarketExposureExceeded: "This market is at its size limit. Lower the leverage or margin.",
  ClaimNotAtHead: "Earlier payouts are ahead of this one. Try again shortly.",
  InvalidClaimIndex: "The payout queue just moved. Try again.",
  InsufficientFreeVault: "The pool can't pay this out yet. It will be paid in order.",
  MathOverflow: "That amount is too large.",
  NothingToClaim: "There's nothing to claim yet.",
  DeferredRewardsPending: "Staking reopens once queued payouts clear.",
};

const BY_NUMBER: Record<number, string> = Object.fromEntries(
  Object.keys(PROGRAM_ERRORS).map((name, index) => [6000 + index, PROGRAM_ERRORS[name]!]),
);

const FALLBACK = "That didn't go through. Try again.";

function rawText(error: unknown): string {
  if (error instanceof Error) {
    const logs = (error as { logs?: unknown }).logs;
    return [error.message, Array.isArray(logs) ? logs.join("\n") : ""].join("\n");
  }
  return typeof error === "string" ? error : JSON.stringify(error ?? "");
}

export function friendlyError(error: unknown): string {
  const text = rawText(error);

  const named = /Error Code: (\w+)/.exec(text)?.[1];
  if (named && PROGRAM_ERRORS[named]) return PROGRAM_ERRORS[named]!;
  const decimal = /Error Number: (\d+)/.exec(text)?.[1];
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text)?.[1];
  const code = decimal ? Number(decimal) : hex ? parseInt(hex, 16) : undefined;
  if (code !== undefined && BY_NUMBER[code]) return BY_NUMBER[code]!;

  if (/trader_usdc|owner_usdc|AccountNotInitialized|could not find account|TokenAccountNotFound/i.test(text)) return "Add USDC to your wallet first, then try again.";
  if (/insufficient funds|0x1\b|insufficient lamports/i.test(text)) return "Your wallet doesn't have enough balance for this.";
  if (/User rejected|rejected the request|declined/i.test(text)) return "You cancelled the request in your wallet.";
  if (/blockhash not found|block height exceeded|expired|timed? ?out|did not land/i.test(text)) return "The network was slow to confirm. Try again.";
  if (/wallet not connected|WalletNotConnected|no wallet/i.test(text)) return "Connect a wallet first.";
  if (/Failed to fetch|NetworkError|ECONN|503|502/i.test(text)) return "Can't reach the network right now. Try again shortly.";

  // Messages we wrote ourselves are already plain; anything that looks like a
  // program log or stack trace is replaced.
  if (error instanceof Error && error.message.length <= 140 && !/Anchor|Error Code|Error Number|Program log|0x[0-9a-f]{2,}|lib\.rs|instruction/i.test(error.message)) return error.message;
  return FALLBACK;
}
