import { PublicKey, type Connection } from "@solana/web3.js";
import { createHash } from "node:crypto";
import type { ChainMarketRow, ChainPositionRow, IndexerStore } from "./store.js";
import type { IndexerLogger } from "./types.js";

class Reader {
  offset = 8;
  constructor(private readonly bytes: Buffer) {}
  take(n: number) { const result = this.bytes.subarray(this.offset, this.offset + n); if (result.length !== n) throw new RangeError("truncated account"); this.offset += n; return result; }
  skip(n: number) { this.take(n); }
  u8() { return this.take(1).readUInt8(); }
  u16() { return this.take(2).readUInt16LE(); }
  u32() { return this.take(4).readUInt32LE(); }
  u64() { return this.take(8).readBigUInt64LE().toString(); }
  i64() { return Number(this.take(8).readBigInt64LE()); }
  pubkey() { return new PublicKey(this.take(32)).toBase58(); }
  hex(n: number) { return this.take(n).toString("hex"); }
}

const discriminator = (name: string) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const MARKET = discriminator("Market");
const POSITION = discriminator("Position");
const kinds = ["up_down", "ladder"];
const marketStatuses = ["open", "halted", "expired", "settled", "invalid"];
const outcomes = ["none", "yes", "no"];
const sides = ["yes", "no"];
const positionStatuses = ["open", "closed", "liquidated", "settled"];

export async function rebuildChainStateIfNeeded(store: IndexerStore, connection: Connection, programId: PublicKey, logger: IndexerLogger): Promise<void> {
  if (!store.isEmpty()) return;
  const accounts = await connection.getProgramAccounts(programId, { commitment: "confirmed" });
  const positions: ChainPositionRow[] = [];
  const markets: ChainMarketRow[] = [];
  for (const account of accounts) {
    const bytes = account.account.data;
    try {
      if (bytes.subarray(0, 8).equals(POSITION)) {
        const r = new Reader(bytes);
        const owner = r.pubkey(); const market = r.pubkey(); r.skip(8);
        const side = sides[r.u8()] ?? "yes"; const marginE6 = r.u64(); const leverage = r.u16();
        const entryE6 = r.u32(); const contractsE6 = r.u64(); const liqMarkE6 = r.u32(); r.skip(8);
        const status = positionStatuses[r.u8()] ?? "open";
        positions.push({ address: account.pubkey.toBase58(), owner, market, side, marginE6, leverage, entryE6, contractsE6, liqMarkE6, status });
      } else if (bytes.subarray(0, 8).equals(MARKET)) {
        const r = new Reader(bytes);
        const symbolHash = r.hex(32); r.skip(64 + 1); const kind = kinds[r.u8()] ?? "up_down";
        const strikeUsdE6 = r.u64(); const openTs = r.i64(); const expiryTs = r.i64();
        r.skip(4 + 4 + 8 + 4 + 2); const status = marketStatuses[r.u8()] ?? "open"; const outcome = outcomes[r.u8()] ?? "none";
        const settlementValueE6 = r.u64();
        markets.push({ address: account.pubkey.toBase58(), symbolHash, kind, strikeUsdE6, openTs, expiryTs, status, outcome, settlementValueE6 });
      }
    } catch (error) {
      logger.warn({ account: account.pubkey.toBase58(), error: error instanceof Error ? error.message : String(error) }, "failed to decode Wick program account during rebuild");
    }
  }
  store.replaceChainState(positions, markets);
  logger.info({ positions: positions.length, markets: markets.length }, "rebuilt indexer projections from Solana program accounts");
}
