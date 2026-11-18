import { closeResult, openPositionMath, sideMarkE6 } from "@wick/pricing";
import type { MarketKind, PositionSide, PricerMarket } from "@wick/shared";

/* Browser-only practice ledger. It uses Wick's position math and live market prices, but it is
   not chain state: its identifiers are deliberately non-Solana receipts and it never invents
   settlement outcomes, pool solvency, historical activity, or staking rewards. */

export const DEMO_STORAGE_KEY = "wick-demo-account-v1";
export const DEMO_START_USDC_E6 = 10_000_000_000n;
export const HALF_SPREAD_E6 = 5_000;
export const PROFIT_FEE_BPS = 200;
const MICRO = 1_000_000;

export type DemoPositionStatus = "open" | "closed" | "liquidated" | "settled";

export interface DemoMarketSnapshot { symbol: string; kind: MarketKind; duration: string; title: string; strike: number; expiryTs: number }

export interface DemoPosition {
  address: string;
  owner: string;
  /* the market's symbol; demo positions key markets by symbol, not by on-chain address */
  market: string;
  side: PositionSide;
  marginE6: string;
  leverage: number;
  entryE6: number;
  contractsE6: string;
  liqMarkE6: number;
  status: DemoPositionStatus;
  realizedPnlE6?: string;
  paidE6?: string;
  openedTs: number;
  closedTs?: number;
  snapshot: DemoMarketSnapshot;
}

export interface DemoClaim { address: string; claimIndex: string; owner: string; amountE6: string; paidE6: string; status: "queued" | "paid" }

export type DemoActivityKind = "open" | "close" | "liquidate" | "settle" | "claim" | "deposit" | "withdraw" | "faucet" | "stake" | "unstake" | "rewards";
export interface DemoActivity { receiptId: string; ts: number; kind: DemoActivityKind; amountE6: string; detail?: string }

export interface DemoLedger {
  version: 2;
  owner: string;
  createdTs: number;
  usdcE6: string;
  wickedE6: string;
  stakedE6: string;
  rewardsE6: string;
  rewardsTs: number;
  positions: DemoPosition[];
  claims: DemoClaim[];
  activity: DemoActivity[];
}

export class DemoError extends Error {}

const big = (value: string): bigint => BigInt(value);
const str = (value: bigint): string => value.toString();
const clampPrice = (value: number): number => Math.max(0, Math.min(MICRO, Math.round(value)));
export const usdcE6 = (dollars: number): bigint => BigInt(Math.round(dollars * MICRO));

const localEntropy = (random: () => number) => Math.floor(random() * 0x1_0000_0000).toString(36).padStart(7, "0");
export function demoReceiptId(random: () => number = Math.random, now: number = Date.now()): string {
  return `demo-receipt-${now.toString(36)}-${localEntropy(random)}`;
}
export function demoAccountId(random: () => number = Math.random, now: number = Date.now()): string {
  return `demo-account-${now.toString(36)}-${localEntropy(random)}`;
}
const demoEntityId = (kind: "position" | "claim", now: number) => `demo-${kind}-${now.toString(36)}-${localEntropy(Math.random)}`;

export function snapshotOf(market: PricerMarket): DemoMarketSnapshot {
  return { symbol: market.symbol, kind: market.kind, duration: market.duration, title: market.title, strike: market.strike, expiryTs: market.expiryTs };
}

export function createLedger(owner: string, now: number): DemoLedger {
  return {
    version: 2, owner, createdTs: now,
    usdcE6: str(DEMO_START_USDC_E6), wickedE6: "0", stakedE6: "0", rewardsE6: "0", rewardsTs: now,
    positions: [], claims: [], activity: [],
  };
}

export function parseLedger(value: string | null): DemoLedger | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<DemoLedger>;
    if (parsed.version !== 2 || typeof parsed.owner !== "string" || typeof parsed.usdcE6 !== "string" || !Array.isArray(parsed.positions)) return undefined;
    return parsed as DemoLedger;
  } catch { return undefined; }
}

function log(ledger: DemoLedger, kind: DemoActivityKind, amountE6: bigint, now: number, detail?: string): { ledger: DemoLedger; receiptId: string } {
  const receiptId = demoReceiptId(Math.random, now);
  const entry: DemoActivity = { receiptId, ts: now, kind, amountE6: str(amountE6), ...(detail ? { detail } : {}) };
  return { ledger: { ...ledger, activity: [entry, ...ledger.activity].slice(0, 200) }, receiptId };
}

export interface OpenInput { side: PositionSide; marginE6: bigint; leverage: number; maxEntryE6: number }

export function openPosition(ledger: DemoLedger, market: PricerMarket, input: OpenInput, now: number): { ledger: DemoLedger; receiptId: string; position: DemoPosition } {
  if (market.status !== "open") throw new DemoError(`This market is ${market.status}.`);
  if (now >= market.expiryTs) throw new DemoError("This market has expired.");
  if (input.marginE6 <= 0n) throw new DemoError("Enter an amount above $0.");
  if (!Number.isSafeInteger(input.leverage) || input.leverage < 1 || input.leverage > market.maxLeverage) throw new DemoError(`Leverage on this market is capped at ${market.maxLeverage}x.`);
  const balance = big(ledger.usdcE6);
  if (input.marginE6 > balance) throw new DemoError(`Not enough USDC. You have $${(Number(balance) / MICRO).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
  const math = openPositionMath({ side: input.side, marginE6: input.marginE6, leverage: input.leverage, markYesE6: clampPrice(market.theo * MICRO), halfSpreadE6: HALF_SPREAD_E6 });
  if (math.entryE6 > input.maxEntryE6) throw new DemoError("The price moved past your slippage limit. Try again.");
  const position: DemoPosition = {
    address: demoEntityId("position", now), owner: ledger.owner, market: market.symbol, side: input.side,
    marginE6: str(input.marginE6), leverage: input.leverage, entryE6: math.entryE6, contractsE6: str(math.contractsE6),
    liqMarkE6: math.liqMarkE6, status: "open", openedTs: now, snapshot: snapshotOf(market),
  };
  const next = log({ ...ledger, usdcE6: str(balance - input.marginE6), positions: [position, ...ledger.positions] }, "open", input.marginE6, now, market.symbol);
  return { ledger: next.ledger, receiptId: next.receiptId, position };
}

/* Local practice completion only. Crediting this browser ledger is not evidence of pool solvency
   or an on-chain payout. */
function finish(ledger: DemoLedger, position: DemoPosition, exitE6: number, status: DemoPositionStatus, now: number): { ledger: DemoLedger; receiptId: string } {
  const result = closeResult(big(position.marginE6), big(position.contractsE6), position.entryE6, clampPrice(exitE6), PROFIT_FEE_BPS);
  /* a liquidated or losing settled position pays nothing (avoids 1-micro rounding dust) */
  const owed = status === "liquidated" || exitE6 <= 0 ? 0n : result.owedE6;
  const pnl = owed - big(position.marginE6);
  const updated: DemoPosition = { ...position, status, realizedPnlE6: str(pnl), paidE6: str(owed), closedTs: now };
  const kind: DemoActivityKind = status === "closed" ? "close" : status === "liquidated" ? "liquidate" : "settle";
  /* losing traders earn $WICKED, 10 per $1 of margin lost */
  const wickedEarned = pnl < 0n ? -pnl * 10n : 0n;
  return log({
    ...ledger,
    usdcE6: str(big(ledger.usdcE6) + owed),
    wickedE6: str(big(ledger.wickedE6) + wickedEarned),
    positions: ledger.positions.map((item) => item.address === position.address ? updated : item),
  }, kind, owed, now, position.market);
}

function openPositionByAddress(ledger: DemoLedger, address: string): DemoPosition {
  const position = ledger.positions.find((item) => item.address === address);
  if (!position) throw new DemoError("Position not found.");
  if (position.status !== "open") throw new DemoError(`This position is already ${position.status}.`);
  return position;
}

export function closePosition(ledger: DemoLedger, address: string, market: PricerMarket | undefined, minExitE6: number, now: number) {
  const position = openPositionByAddress(ledger, address);
  if (!market || market.status !== "open" || now >= position.snapshot.expiryTs) throw new DemoError("This market has stopped trading. Settle the position instead.");
  const exit = Math.max(0, sideMarkE6(position.side, clampPrice(market.theo * MICRO)) - HALF_SPREAD_E6);
  if (exit < minExitE6) throw new DemoError("The price moved past your slippage limit. Try again.");
  return finish(ledger, position, exit, "closed", now);
}

export function settlePosition(ledger: DemoLedger, address: string, officialOutcome: PositionSide | undefined, now: number) {
  const position = openPositionByAddress(ledger, address);
  if (now < position.snapshot.expiryTs) throw new DemoError("This market hasn't expired yet. Close the position to exit early.");
  if (officialOutcome === undefined) throw new DemoError("Waiting for Gemini's official outcome. BTC spot does not settle this position.");
  const won = officialOutcome === position.side;
  return finish(ledger, position, won ? MICRO : 0, "settled", now);
}

export function claimQueue(ledger: DemoLedger, address: string, now: number) {
  const claim = ledger.claims.find((item) => item.address === address);
  if (!claim) throw new DemoError("Claim not found.");
  if (claim.status === "paid") throw new DemoError("This claim is already paid.");
  const remaining = big(claim.amountE6) - big(claim.paidE6);
  return log({
    ...ledger,
    usdcE6: str(big(ledger.usdcE6) + remaining),
    claims: ledger.claims.map((item) => item.address === address ? { ...item, paidE6: item.amountE6, status: "paid" as const } : item),
  }, "claim", remaining, now, `#${claim.claimIndex}`);
}

export function pendingRewardsE6(ledger: DemoLedger): bigint { return big(ledger.rewardsE6); }

export function stake(ledger: DemoLedger, amountE6: bigint, now: number) {
  if (amountE6 <= 0n) throw new DemoError("Stake amount must be positive.");
  if (amountE6 > big(ledger.wickedE6)) throw new DemoError("Not enough $WICKED in your wallet.");
  return log({ ...ledger, rewardsTs: now, wickedE6: str(big(ledger.wickedE6) - amountE6), stakedE6: str(big(ledger.stakedE6) + amountE6) }, "stake", amountE6, now);
}

export function unstake(ledger: DemoLedger, amountE6: bigint, now: number) {
  if (amountE6 <= 0n) throw new DemoError("Unstake amount must be positive.");
  if (amountE6 > big(ledger.stakedE6)) throw new DemoError("That's more than you have staked.");
  return log({ ...ledger, rewardsTs: now, wickedE6: str(big(ledger.wickedE6) + amountE6), stakedE6: str(big(ledger.stakedE6) - amountE6) }, "unstake", amountE6, now);
}

export function claimRewards(ledger: DemoLedger, now: number) {
  const rewards = big(ledger.rewardsE6);
  if (rewards <= 0n) throw new DemoError("The browser demo does not fabricate staking rewards. Connect a configured devnet wallet for chain-backed rewards.");
  return log({ ...ledger, rewardsTs: now, usdcE6: str(big(ledger.usdcE6) + rewards), rewardsE6: "0" }, "rewards", rewards, now);
}

export function deposit(ledger: DemoLedger, amountE6: bigint, now: number, kind: "deposit" | "faucet" = "deposit") {
  if (amountE6 <= 0n) throw new DemoError("Enter an amount above $0.");
  return log({ ...ledger, usdcE6: str(big(ledger.usdcE6) + amountE6) }, kind, amountE6, now);
}

export function withdraw(ledger: DemoLedger, amountE6: bigint, to: string, now: number) {
  if (amountE6 <= 0n) throw new DemoError("Enter an amount above $0.");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(to.trim())) throw new DemoError("Enter a valid Solana address.");
  if (amountE6 > big(ledger.usdcE6)) throw new DemoError("That's more than your balance.");
  return log({ ...ledger, usdcE6: str(big(ledger.usdcE6) - amountE6) }, "withdraw", amountE6, now, to.trim());
}

/* Runs only the mark-based local liquidation rule. Expired positions remain pending because the
   frontend market snapshot does not expose Gemini's official resolutionSide. */
export function reconcile(ledger: DemoLedger, markets: readonly PricerMarket[], now: number): DemoLedger {
  if (markets.length === 0) return ledger;
  const bySymbol = new Map(markets.map((market) => [market.symbol, market]));
  let next = ledger;
  for (const position of ledger.positions) {
    if (position.status !== "open") continue;
    const market = bySymbol.get(position.market);
    if (now >= position.snapshot.expiryTs) continue;
    if (!market || position.liqMarkE6 <= 0) continue;
    const mark = sideMarkE6(position.side, clampPrice(market.theo * MICRO));
    if (mark <= position.liqMarkE6) next = finish(next, position, mark, "liquidated", now).ledger;
  }
  return next;
}
