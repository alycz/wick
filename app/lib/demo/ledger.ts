import { closeResult, openPositionMath, sideMarkE6 } from "@wick/pricing";
import type { MarketKind, PositionSide, PricerMarket } from "@wick/shared";

/* The demo account: a ledger kept in the browser for visitors who haven't connected a wallet.
   Every number runs through Wick's real position math against live market prices, so the demo
   behaves like the program would: same entry, contracts, liquidation mark, 2% profit fee and payout. */

export const DEMO_STORAGE_KEY = "wick-demo-account-v1";
export const DEMO_START_USDC_E6 = 10_000_000_000n;
export const HALF_SPREAD_E6 = 5_000;
export const PROFIT_FEE_BPS = 200;
const MICRO = 1_000_000;
/* $WICKED stakers earn about $0.40 a day per 1,000 staked */
const REWARD_E6_PER_WICKED_SECOND = 0.0004 / 86_400;

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
export interface DemoActivity { signature: string; ts: number; kind: DemoActivityKind; amountE6: string; detail?: string }

export interface DemoLedger {
  version: 1;
  owner: string;
  createdTs: number;
  usdcE6: string;
  wickedE6: string;
  stakedE6: string;
  rewardsE6: string;
  rewardsTs: number;
  nextClaimIndex: number;
  seeded: boolean;
  positions: DemoPosition[];
  claims: DemoClaim[];
  activity: DemoActivity[];
}

export class DemoError extends Error {}

const big = (value: string): bigint => BigInt(value);
const str = (value: bigint): string => value.toString();
const clampPrice = (value: number): number => Math.max(0, Math.min(MICRO, Math.round(value)));
export const usdcE6 = (dollars: number): bigint => BigInt(Math.round(dollars * MICRO));

/* base58 string shaped like a Solana signature, so it reads naturally next to real ones */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function demoSignature(random: () => number = Math.random, length = 88): string {
  let out = "";
  for (let index = 0; index < length; index += 1) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

export function snapshotOf(market: PricerMarket): DemoMarketSnapshot {
  return { symbol: market.symbol, kind: market.kind, duration: market.duration, title: market.title, strike: market.strike, expiryTs: market.expiryTs };
}

export function createLedger(owner: string, now: number): DemoLedger {
  return {
    version: 1, owner, createdTs: now,
    usdcE6: str(DEMO_START_USDC_E6), wickedE6: "1250000000", stakedE6: "0", rewardsE6: "0", rewardsTs: now,
    nextClaimIndex: 1, seeded: false, positions: [], claims: [], activity: [],
  };
}

export function parseLedger(value: string | null): DemoLedger | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<DemoLedger>;
    if (parsed.version !== 1 || typeof parsed.owner !== "string" || typeof parsed.usdcE6 !== "string" || !Array.isArray(parsed.positions)) return undefined;
    return parsed as DemoLedger;
  } catch { return undefined; }
}

function log(ledger: DemoLedger, kind: DemoActivityKind, amountE6: bigint, now: number, detail?: string): { ledger: DemoLedger; signature: string } {
  const signature = demoSignature();
  const entry: DemoActivity = { signature, ts: now, kind, amountE6: str(amountE6), ...(detail ? { detail } : {}) };
  return { ledger: { ...ledger, activity: [entry, ...ledger.activity].slice(0, 200) }, signature };
}

/* YES pays when BTC finishes above the strike (Up/Down: above the opening price) */
export function yesWins(snapshot: DemoMarketSnapshot, finalSpot: number): boolean { return finalSpot > snapshot.strike; }

export interface OpenInput { side: PositionSide; marginE6: bigint; leverage: number; maxEntryE6: number }

export function openPosition(ledger: DemoLedger, market: PricerMarket, input: OpenInput, now: number): { ledger: DemoLedger; signature: string; position: DemoPosition } {
  if (market.status !== "open") throw new DemoError(`This market is ${market.status}.`);
  if (now >= market.expiryTs) throw new DemoError("This market has expired.");
  if (input.marginE6 <= 0n) throw new DemoError("Enter an amount above $0.");
  if (!Number.isSafeInteger(input.leverage) || input.leverage < 1 || input.leverage > market.maxLeverage) throw new DemoError(`Leverage on this market is capped at ${market.maxLeverage}x.`);
  const balance = big(ledger.usdcE6);
  if (input.marginE6 > balance) throw new DemoError(`Not enough USDC. You have $${(Number(balance) / MICRO).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
  const math = openPositionMath({ side: input.side, marginE6: input.marginE6, leverage: input.leverage, markYesE6: clampPrice(market.theo * MICRO), halfSpreadE6: HALF_SPREAD_E6 });
  if (math.entryE6 > input.maxEntryE6) throw new DemoError("The price moved past your slippage limit. Try again.");
  const position: DemoPosition = {
    address: demoSignature(Math.random, 44), owner: ledger.owner, market: market.symbol, side: input.side,
    marginE6: str(input.marginE6), leverage: input.leverage, entryE6: math.entryE6, contractsE6: str(math.contractsE6),
    liqMarkE6: math.liqMarkE6, status: "open", openedTs: now, snapshot: snapshotOf(market),
  };
  const next = log({ ...ledger, usdcE6: str(balance - input.marginE6), positions: [position, ...ledger.positions] }, "open", input.marginE6, now, market.symbol);
  return { ledger: next.ledger, signature: next.signature, position };
}

/* Pays out a finished position. Wick's demo pool is always solvent, so owed USDC lands straight away. */
function finish(ledger: DemoLedger, position: DemoPosition, exitE6: number, status: DemoPositionStatus, now: number): { ledger: DemoLedger; signature: string } {
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

export function settlePosition(ledger: DemoLedger, address: string, finalSpot: number | undefined, now: number) {
  const position = openPositionByAddress(ledger, address);
  if (now < position.snapshot.expiryTs) throw new DemoError("This market hasn't expired yet. Close the position to exit early.");
  if (finalSpot === undefined) throw new DemoError("Waiting for the settlement price.");
  const won = yesWins(position.snapshot, finalSpot) === (position.side === "yes");
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

function accrue(ledger: DemoLedger, now: number): DemoLedger {
  const seconds = Math.max(0, (now - ledger.rewardsTs) / 1000);
  const staked = Number(big(ledger.stakedE6)) / MICRO;
  const earned = BigInt(Math.floor(staked * seconds * REWARD_E6_PER_WICKED_SECOND * MICRO));
  return { ...ledger, rewardsE6: str(big(ledger.rewardsE6) + earned), rewardsTs: now };
}

export function pendingRewardsE6(ledger: DemoLedger, now: number): bigint { return big(accrue(ledger, now).rewardsE6); }

export function stake(ledger: DemoLedger, amountE6: bigint, now: number) {
  if (amountE6 <= 0n) throw new DemoError("Stake amount must be positive.");
  if (amountE6 > big(ledger.wickedE6)) throw new DemoError("Not enough $WICKED in your wallet.");
  const accrued = accrue(ledger, now);
  return log({ ...accrued, wickedE6: str(big(accrued.wickedE6) - amountE6), stakedE6: str(big(accrued.stakedE6) + amountE6) }, "stake", amountE6, now);
}

export function unstake(ledger: DemoLedger, amountE6: bigint, now: number) {
  if (amountE6 <= 0n) throw new DemoError("Unstake amount must be positive.");
  if (amountE6 > big(ledger.stakedE6)) throw new DemoError("That's more than you have staked.");
  const accrued = accrue(ledger, now);
  return log({ ...accrued, wickedE6: str(big(accrued.wickedE6) + amountE6), stakedE6: str(big(accrued.stakedE6) - amountE6) }, "unstake", amountE6, now);
}

export function claimRewards(ledger: DemoLedger, now: number) {
  const accrued = accrue(ledger, now);
  const rewards = big(accrued.rewardsE6);
  if (rewards <= 0n) throw new DemoError(big(ledger.stakedE6) > 0n ? "No rewards yet. They build up while you stay staked." : "Stake $WICKED to start earning rewards.");
  return log({ ...accrued, usdcE6: str(big(accrued.usdcE6) + rewards), rewardsE6: "0" }, "rewards", rewards, now);
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

/* Runs the keeper's job against live prices: liquidate positions whose mark crossed their
   liquidation level and settle expired ones at BTC spot. Returns the same object when nothing changed. */
export function reconcile(ledger: DemoLedger, markets: readonly PricerMarket[], now: number): DemoLedger {
  if (markets.length === 0) return ledger;
  const bySymbol = new Map(markets.map((market) => [market.symbol, market]));
  const spot = markets.find((market) => Number.isFinite(market.spot) && market.spot > 0)?.spot;
  let next = ledger;
  for (const position of ledger.positions) {
    if (position.status !== "open") continue;
    const market = bySymbol.get(position.market);
    if (now >= position.snapshot.expiryTs) {
      if (spot !== undefined) next = settlePosition(next, position.address, spot, now).ledger;
      continue;
    }
    if (!market || position.liqMarkE6 <= 0) continue;
    const mark = sideMarkE6(position.side, clampPrice(market.theo * MICRO));
    if (mark <= position.liqMarkE6) next = finish(next, position, mark, "liquidated", now).ledger;
  }
  return next;
}

/* A few days of past trades so a first visit to Portfolio has history to look at. Built around
   the live BTC price, priced with the same math, so the numbers hang together. */
export function seedHistory(ledger: DemoLedger, spot: number, now: number): DemoLedger {
  if (ledger.seeded || !(spot > 0)) return ledger;
  const hour = 3_600_000;
  const round = (value: number) => Math.round(value / 500) * 500;
  const trades: Array<{ ago: number; strikeOff: number; side: PositionSide; margin: number; lev: number; theo: number; exit: number; status: DemoPositionStatus }> = [
    { ago: 70, strikeOff: -1000, side: "yes", margin: 250, lev: 3, theo: .58, exit: 1, status: "settled" },
    { ago: 52, strikeOff: 1500, side: "no", margin: 400, lev: 2, theo: .37, exit: .29, status: "closed" },
    { ago: 30, strikeOff: 500, side: "yes", margin: 150, lev: 5, theo: .46, exit: .37, status: "liquidated" },
    { ago: 9, strikeOff: -500, side: "yes", margin: 300, lev: 2, theo: .55, exit: .71, status: "closed" },
  ];
  let usdc = big(ledger.usdcE6);
  let wicked = big(ledger.wickedE6);
  const positions: DemoPosition[] = [];
  const activity: DemoActivity[] = [];
  for (const trade of trades) {
    const strike = round(spot + trade.strikeOff);
    const openedTs = now - trade.ago * hour;
    const expiryTs = openedTs + 24 * hour;
    const closedTs = trade.status === "settled" ? expiryTs : openedTs + 6 * hour;
    const marginE6 = usdcE6(trade.margin);
    const math = openPositionMath({ side: trade.side, marginE6, leverage: trade.lev, markYesE6: clampPrice(trade.theo * MICRO), halfSpreadE6: HALF_SPREAD_E6 });
    const exitE6 = trade.status === "liquidated" ? math.liqMarkE6 : clampPrice((trade.side === "yes" ? trade.exit : 1 - trade.exit) * MICRO);
    const result = closeResult(marginE6, math.contractsE6, math.entryE6, exitE6, PROFIT_FEE_BPS);
    const owed = trade.status === "liquidated" ? 0n : result.owedE6;
    usdc += owed - marginE6;
    if (owed < marginE6) wicked += (marginE6 - owed) * 10n;
    const symbol = `BTC-DEMO-${strike}-${Math.floor(expiryTs / 1000)}`;
    positions.push({
      address: demoSignature(Math.random, 44), owner: ledger.owner, market: symbol, side: trade.side, marginE6: str(marginE6), leverage: trade.lev,
      entryE6: math.entryE6, contractsE6: str(math.contractsE6), liqMarkE6: math.liqMarkE6, status: trade.status,
      realizedPnlE6: str(owed - marginE6), paidE6: str(owed), openedTs, closedTs,
      snapshot: { symbol, kind: "ladder", duration: "1d", title: `Bitcoin above $${strike.toLocaleString("en-US")}`, strike, expiryTs },
    });
    activity.push({ signature: demoSignature(), ts: openedTs, kind: "open", amountE6: str(marginE6), detail: symbol });
    activity.push({ signature: demoSignature(), ts: closedTs, kind: trade.status === "closed" ? "close" : trade.status === "liquidated" ? "liquidate" : "settle", amountE6: str(owed), detail: symbol });
  }
  /* one winner was paid partly from a short pool, so its rest waits in the payout queue */
  const claim: DemoClaim = { address: demoSignature(Math.random, 44), claimIndex: String(ledger.nextClaimIndex), owner: ledger.owner, amountE6: "64180000", paidE6: "21400000", status: "queued" };
  positions.sort((left, right) => (right.closedTs ?? right.openedTs) - (left.closedTs ?? left.openedTs));
  activity.sort((left, right) => right.ts - left.ts);
  return {
    ...ledger, seeded: true, usdcE6: str(usdc), wickedE6: str(wicked), nextClaimIndex: ledger.nextClaimIndex + 1,
    positions: [...ledger.positions, ...positions], claims: [...ledger.claims, claim], activity: [...ledger.activity, ...activity].slice(0, 200),
  };
}
