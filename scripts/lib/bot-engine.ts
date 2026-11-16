export type BotSide = "yes" | "no";

export interface BotMarket {
  symbol: string;
  status: string;
  expiryTs: number;
  maxLeverage: number;
}

export interface BotWallet { id: string }
export interface BotOpenRequest {
  wallet: BotWallet;
  market: BotMarket;
  side: BotSide;
  marginE6: bigint;
  leverage: number;
  nonce: bigint;
}

export interface BotTransport {
  prepareWallet(index: number): Promise<BotWallet>;
  listMarkets(): Promise<BotMarket[]>;
  openPosition(request: BotOpenRequest): Promise<string>;
}

export interface BotRunOptions {
  count: number;
  durationMs: number;
  intervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onResult?: (result: BotResult) => void;
}

export interface BotResult {
  attempted: number;
  opened: number;
  failed: number;
  signatures: string[];
  errors: string[];
}

export async function runBots(transport: BotTransport, options: BotRunOptions): Promise<BotResult> {
  if (options.count < 1 || options.durationMs < 1 || options.intervalMs < 1) throw new RangeError("bot run options must be positive");
  const now = options.now ?? Date.now;
  const delay = options.sleep ?? ((ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms)));
  const random = options.random ?? Math.random;
  const wallets = await Promise.all(Array.from({ length: options.count }, (_, index) => transport.prepareWallet(index)));
  const result: BotResult = { attempted: 0, opened: 0, failed: 0, signatures: [], errors: [] };
  const endAt = now() + options.durationMs;
  let iteration = 0;
  while (now() < endAt) {
    const markets = (await transport.listMarkets()).filter((market) => market.status === "open" && market.expiryTs > now() && market.maxLeverage >= 1);
    if (markets.length === 0) throw new Error("No real configured devnet market is open; bots stopped without submitting transactions");
    const wallet = wallets[iteration % wallets.length] as BotWallet;
    const market = markets[Math.floor(random() * markets.length)] as BotMarket;
    const side: BotSide = random() < 0.5 ? "yes" : "no";
    const leverage = Math.max(1, Math.min(market.maxLeverage, 1 + Math.floor(random() * market.maxLeverage)));
    const marginE6 = BigInt(5 + Math.floor(random() * 46)) * 1_000_000n;
    result.attempted += 1;
    try {
      const signature = await transport.openPosition({ wallet, market, side, marginE6, leverage, nonce: BigInt(now()) * 1_000n + BigInt(iteration) });
      result.opened += 1;
      result.signatures.push(signature);
    } catch (error) {
      result.failed += 1;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
    options.onResult?.(result);
    iteration += 1;
    if (now() < endAt) await delay(options.intervalMs);
  }
  return result;
}
