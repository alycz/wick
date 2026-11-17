import { BorshEventCoder, type Idl } from "@coral-xyz/anchor";
import { WICK_IDL } from "@wick/shared";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import type { DecodedProgramEvent } from "./types.js";

const PROGRAM_DATA_PREFIX = "Program data: ";

class BinaryReader {
  private offset = 0;
  constructor(private readonly bytes: Buffer) {}
  private take(length: number): Buffer {
    if (this.offset + length > this.bytes.length) throw new RangeError("truncated Anchor event");
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }
  u8(): number { return this.take(1).readUInt8(0); }
  bool(): boolean { return this.u8() !== 0; }
  u16(): number { return this.take(2).readUInt16LE(0); }
  u32(): number { return this.take(4).readUInt32LE(0); }
  u64(): string { return this.take(8).readBigUInt64LE(0).toString(); }
  i64(): number { return Number(this.take(8).readBigInt64LE(0)); }
  i128(): string {
    const bytes = this.take(16);
    let value = 0n;
    for (let index = 15; index >= 0; index -= 1) value = (value << 8n) | BigInt(bytes[index]!);
    if ((value & (1n << 127n)) !== 0n) value -= 1n << 128n;
    return value.toString();
  }
  pubkey(): string { return new PublicKey(this.take(32)).toBase58(); }
  bytes32(): string { return this.take(32).toString("hex"); }
}

type ManualDecoder = (reader: BinaryReader) => Record<string, unknown>;

const side = (value: number): "yes" | "no" => value === 0 ? "yes" : "no";
const kind = (value: number): "up_down" | "ladder" => value === 0 ? "up_down" : "ladder";
const outcome = (value: number): "none" | "yes" | "no" => (["none", "yes", "no"] as const)[value] ?? "none";

const MANUAL_DECODERS: Record<string, ManualDecoder> = {
  ConfigInitialized: (r) => ({ admin: r.pubkey(), keeper: r.pubkey(), usdcMint: r.pubkey(), loserMint: r.pubkey() }),
  MarketCreated: (r) => ({ market: r.pubkey(), symbolHash: r.bytes32(), kind: kind(r.u8()), strikeUsdE6: r.u64(), openTs: r.i64(), expiryTs: r.i64() }),
  MarksUpdated: (r) => ({ count: r.u16(), slot: r.u64() }),
  PositionOpened: (r) => ({ position: r.pubkey(), owner: r.pubkey(), market: r.pubkey(), side: side(r.u8()), margin: r.u64(), leverage: r.u16(), entryE6: r.u32(), contractsE6: r.u64(), liqMarkE6: r.u32() }),
  PositionClosed: (r) => ({ position: r.pubkey(), owner: r.pubkey(), exitE6: r.u32(), pnlE6: r.i128(), feeE6: r.u64(), paidE6: r.u64() }),
  PositionLiquidated: (r) => ({ position: r.pubkey(), owner: r.pubkey(), marginE6: r.u64(), liqFeeE6: r.u64(), wickedMintedE6: r.u64() }),
  MarketSettled: (r) => ({ market: r.pubkey(), outcome: outcome(r.u8()), settlementValueE6: r.u64() }),
  MarketVoided: (r) => ({ market: r.pubkey() }),
  PositionSettled: (r) => ({ position: r.pubkey(), owner: r.pubkey(), outcome: outcome(r.u8()), pnlE6: r.i128(), feeE6: r.u64(), paidE6: r.u64() }),
  ClaimQueued: (r) => ({ claim: r.pubkey(), index: r.u64(), owner: r.pubkey(), amount: r.u64() }),
  ClaimPaid: (r) => ({ claim: r.pubkey(), index: r.u64(), owner: r.pubkey(), amount: r.u64(), complete: r.bool() }),
  Staked: (r) => ({ owner: r.pubkey(), amount: r.u64(), total: r.u64() }),
  Unstaked: (r) => ({ owner: r.pubkey(), amount: r.u64(), total: r.u64() }),
  RewardsClaimed: (r) => ({ owner: r.pubkey(), amount: r.u64() }),
  ParamsUpdated: (r) => ({ admin: r.pubkey() }),
  PausedUpdated: (r) => ({ paused: r.bool() }),
  KeeperUpdated: (r) => ({ keeper: r.pubkey() }),
  LpUpdated: (r) => ({ balance: r.i128(), queueOwed: r.u64() }),
};

const DISCRIMINATORS = new Map<string, string>(
  Object.keys(MANUAL_DECODERS).map((name) => [
    createHash("sha256").update(`event:${name}`).digest().subarray(0, 8).toString("hex"),
    name,
  ]),
);

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object") {
    if ("toBase58" in value && typeof value.toBase58 === "function") return value.toBase58();
    if ("toString" in value && value.constructor?.name === "BN") return value.toString();
    if (Array.isArray(value)) return value.map(normalize);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
  }
  return value;
}

export class WickEventDecoder {
  private readonly anchorCoder: BorshEventCoder | undefined;

  constructor(idl: Idl = WICK_IDL as unknown as Idl) {
    this.anchorCoder = (idl.events?.length ?? 0) > 0 ? new BorshEventCoder(idl) : undefined;
  }

  decodeLog(log: string): DecodedProgramEvent | undefined {
    if (!log.startsWith(PROGRAM_DATA_PREFIX)) return undefined;
    const encoded = log.slice(PROGRAM_DATA_PREFIX.length).trim();
    if (!encoded) return undefined;
    if (this.anchorCoder) {
      try {
        const decoded = this.anchorCoder.decode(encoded);
        if (decoded) return { name: decoded.name, data: normalize(decoded.data) as Record<string, unknown> };
      } catch { /* fall through to the exact WP2 event layouts */ }
    }
    try {
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length < 8) return undefined;
      const name = DISCRIMINATORS.get(bytes.subarray(0, 8).toString("hex"));
      if (!name) return undefined;
      return { name, data: MANUAL_DECODERS[name]!(new BinaryReader(bytes.subarray(8))) };
    } catch {
      return undefined;
    }
  }

  decodeLogs(logs: readonly string[], programId?: string): DecodedProgramEvent[] {
    if (!programId) return logs.flatMap((log) => {
      const event = this.decodeLog(log);
      return event ? [event] : [];
    });

    const invocationStack: string[] = [];
    const events: DecodedProgramEvent[] = [];
    for (const log of logs) {
      const invoked = /^Program (\S+) invoke \[\d+\]$/.exec(log);
      if (invoked?.[1]) {
        invocationStack.push(invoked[1]);
        continue;
      }
      const completed = /^Program (\S+) (?:success|failed:.*)$/.exec(log);
      if (completed?.[1]) {
        const match = invocationStack.lastIndexOf(completed[1]);
        if (match >= 0) invocationStack.splice(match);
        continue;
      }
      if (invocationStack.at(-1) !== programId) continue;
      const event = this.decodeLog(log);
      if (event) events.push(event);
    }
    return events;
  }
}

export function encodeEventForTest(name: keyof typeof MANUAL_DECODERS, payload: Buffer): string {
  const discriminator = createHash("sha256").update(`event:${name}`).digest().subarray(0, 8);
  return `${PROGRAM_DATA_PREFIX}${Buffer.concat([discriminator, payload]).toString("base64")}`;
}
