import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import anchor, { AnchorProvider, Program, Wallet, type Idl, web3 } from "@coral-xyz/anchor";

// Node ESM cannot see BN as a named export of anchor's CJS build, so read it off the default export.
const { BN } = anchor;
import { WICK_IDL } from "@wick/shared";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { ChainPort, CreateMarketRequest, MarkUpdateRequest, OpenPositionRef, SettlementMarketRef, SettlementMarketStatus } from "./types.js";

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const REQUIRED_INSTRUCTIONS = {
  createMarket: {
    accounts: ["keeper", "config", "market", "systemProgram"],
    args: ["symbol", "symbolHash", "kind", "strikeUsdE6", "openTs", "expiryTs", "cutoffSecs", "halfSpreadE6"],
  },
  updateMarks: { accounts: ["keeper", "config"], args: ["updates"] },
  liquidate: {
    accounts: ["liquidator", "config", "market", "position", "owner", "lp", "loserMint", "ownerWicked", "tokenProgram", "associatedTokenProgram", "systemProgram"],
    args: [],
  },
  settleMarket: { accounts: ["keeper", "config", "market"], args: ["outcome", "settlementValueE6"] },
  voidMarket: { accounts: ["keeper", "config", "market"], args: [] },
  settlePosition: {
    accounts: ["payer", "config", "market", "position", "owner", "lp", "vault", "usdcMint", "ownerUsdc", "loserMint", "ownerWicked", "claim", "tokenProgram", "associatedTokenProgram", "systemProgram"],
    args: ["claimIndex"],
  },
  claimQueue: {
    accounts: ["payer", "config", "lp", "vault", "usdcMint", "claim", "owner", "ownerUsdc", "tokenProgram", "associatedTokenProgram", "systemProgram"],
    args: [],
  },
} as const;
const REQUIRED_ACCOUNTS = ["config", "lpState", "market", "position", "payoutClaim"] as const;

type AccountRow = { publicKey: web3.PublicKey; account: Record<string, unknown> };
type AccountClient = { fetch(address: web3.PublicKey): Promise<Record<string, unknown>>; all(): Promise<AccountRow[]> };
type MethodBuilder = {
  accountsStrict(accounts: Record<string, web3.PublicKey>): MethodBuilder;
  remainingAccounts(accounts: Array<{ pubkey: web3.PublicKey; isSigner: boolean; isWritable: boolean }>): MethodBuilder;
  preInstructions(instructions: web3.TransactionInstruction[]): MethodBuilder;
  rpc(): Promise<string>;
};
export interface TransactionBuilder { rpc(): Promise<string> }
export interface TransactionConfirmer {
  confirmTransaction(signature: string, commitment: web3.Commitment): Promise<web3.RpcResponseAndContext<web3.SignatureResult>>;
}
type DynamicProgram = { methods: Record<string, (...args: unknown[]) => MethodBuilder>; account: Record<string, AccountClient> };

export interface ChainTransport {
  marketExists(symbol: string, signal?: AbortSignal): Promise<boolean>;
  createMarket(request: CreateMarketRequest, signal?: AbortSignal): Promise<string>;
  updateMarks(requests: readonly MarkUpdateRequest[], priorityFeeMicroLamports: number, signal?: AbortSignal): Promise<string>;
  listOpenPositions(signal?: AbortSignal): Promise<readonly OpenPositionRef[]>;
  listSettlementMarkets(signal?: AbortSignal): Promise<readonly SettlementMarketRef[]>;
  liquidate(positionAddress: string, signal?: AbortSignal): Promise<string>;
  settleMarket(symbol: string, outcome: "yes" | "no", settlementValueE6: bigint, signal?: AbortSignal): Promise<string>;
  voidMarket(symbol: string, signal?: AbortSignal): Promise<string>;
  settleOpenPositions(symbol: string, signal?: AbortSignal): Promise<readonly string[]>;
  claimQueue(signal?: AbortSignal): Promise<readonly string[]>;
  close?(): Promise<void> | void;
}

export class ConfiguredChainPort implements ChainPort {
  constructor(private readonly transport: ChainTransport) {}
  configured(): boolean { return true; }
  marketExists(symbol: string, signal?: AbortSignal) { return this.transport.marketExists(symbol, signal); }
  createMarket(request: CreateMarketRequest, signal?: AbortSignal) { return this.transport.createMarket(request, signal); }
  updateMarks(requests: readonly MarkUpdateRequest[], options: { priorityFeeMicroLamports: number; signal?: AbortSignal }) { return this.transport.updateMarks(requests, options.priorityFeeMicroLamports, options.signal); }
  listOpenPositions(signal?: AbortSignal) { return this.transport.listOpenPositions(signal); }
  listSettlementMarkets(signal?: AbortSignal) { return this.transport.listSettlementMarkets(signal); }
  liquidate(positionAddress: string, signal?: AbortSignal) { return this.transport.liquidate(positionAddress, signal); }
  settleMarket(symbol: string, outcome: "yes" | "no", settlementValueE6: bigint, signal?: AbortSignal) { return this.transport.settleMarket(symbol, outcome, settlementValueE6, signal); }
  voidMarket(symbol: string, signal?: AbortSignal) { return this.transport.voidMarket(symbol, signal); }
  settleOpenPositions(symbol: string, signal?: AbortSignal) { return this.transport.settleOpenPositions(symbol, signal); }
  claimQueue(signal?: AbortSignal) { return this.transport.claimQueue(signal); }
  close() { return this.transport.close?.(); }
}

/** Explicit unavailable state. It never acknowledges a transaction that was not submitted. */
export class UnconfiguredChainPort implements ChainPort {
  configured(): boolean { return false; }
  private unavailable(): Error { return new Error("Wick chain port is not configured"); }
  marketExists(_symbol: string, _signal?: AbortSignal): Promise<boolean> { return Promise.reject(this.unavailable()); }
  createMarket(_request: CreateMarketRequest, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  updateMarks(_requests: readonly MarkUpdateRequest[], _options: { priorityFeeMicroLamports: number; signal?: AbortSignal }): Promise<string> { return Promise.reject(this.unavailable()); }
  listOpenPositions(_signal?: AbortSignal): Promise<readonly OpenPositionRef[]> { return Promise.reject(this.unavailable()); }
  listSettlementMarkets(_signal?: AbortSignal): Promise<readonly SettlementMarketRef[]> { return Promise.reject(this.unavailable()); }
  liquidate(_positionAddress: string, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  settleMarket(_symbol: string, _outcome: "yes" | "no", _settlementValueE6: bigint, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  voidMarket(_symbol: string, _signal?: AbortSignal): Promise<string> { return Promise.reject(this.unavailable()); }
  settleOpenPositions(_symbol: string, _signal?: AbortSignal): Promise<readonly string[]> { return Promise.reject(this.unavailable()); }
  claimQueue(_signal?: AbortSignal): Promise<readonly string[]> { return Promise.reject(this.unavailable()); }
}

export interface ChainPortEnvironment { PROGRAM_ID?: string; KEEPER_KEYPAIR?: string; PUBLIC_SOLANA_RPC_URL?: string }
export interface ChainPortFactoryOptions {
  environment?: ChainPortEnvironment;
  idl?: Idl;
  transportFactory?: (configuration: { programId: web3.PublicKey; keeper: web3.Keypair; rpcUrl: string; idl: Idl }) => Promise<ChainTransport>;
}

/** Select the write-capable port only when all production prerequisites agree. */
export async function createChainPort(options: ChainPortFactoryOptions = {}): Promise<ChainPort> {
  const environment = options.environment ?? process.env;
  const programIdText = environment.PROGRAM_ID?.trim();
  const keeperText = environment.KEEPER_KEYPAIR?.trim();
  if (!programIdText && !keeperText) return new UnconfiguredChainPort();
  if (!programIdText || !keeperText) throw new Error("PROGRAM_ID and KEEPER_KEYPAIR must be configured together");
  const programId = new web3.PublicKey(programIdText);
  const idl = options.idl ?? (WICK_IDL as unknown as Idl);
  validateGeneratedIdl(idl, programId);
  const keeper = await loadKeeperKeypair(keeperText);
  const rpcUrl = environment.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  const transport = options.transportFactory
    ? await options.transportFactory({ programId, keeper, rpcUrl, idl })
    : await AnchorChainTransport.create({ programId, keeper, rpcUrl, idl });
  return new ConfiguredChainPort(transport);
}

export function validateGeneratedIdl(idl: Idl, programId: web3.PublicKey): void {
  if (idl.address !== programId.toBase58()) throw new Error("PROGRAM_ID does not match the generated Wick IDL address");
  const instructions = new Map((idl.instructions ?? []).map((item) => [normalizeName(item.name), item]));
  const accounts = new Set((idl.accounts ?? []).map((item) => normalizeName(item.name)));
  for (const [name, shape] of Object.entries(REQUIRED_INSTRUCTIONS)) {
    const instruction = instructions.get(normalizeName(name));
    if (!instruction) throw new Error(`Generated Wick IDL is missing instruction ${name}`);
    const instructionAccounts = new Set(flattenIdlAccountNames(instruction.accounts));
    for (const account of shape.accounts) {
      if (!instructionAccounts.has(normalizeName(account))) throw new Error(`Generated Wick IDL instruction ${name} is missing account ${account}`);
    }
    const args = new Set(instruction.args.map((arg) => normalizeName(arg.name)));
    for (const arg of shape.args) if (!args.has(normalizeName(arg))) throw new Error(`Generated Wick IDL instruction ${name} is missing argument ${arg}`);
  }
  for (const name of REQUIRED_ACCOUNTS) if (!accounts.has(normalizeName(name))) throw new Error(`Generated Wick IDL is missing account ${name}`);
}

function flattenIdlAccountNames(accounts: Idl["instructions"][number]["accounts"]): string[] {
  const names: string[] = [];
  for (const account of accounts) {
    names.push(normalizeName(account.name));
    if ("accounts" in account) names.push(...flattenIdlAccountNames(account.accounts));
  }
  return names;
}

class AnchorChainTransport implements ChainTransport {
  private readonly program: DynamicProgram;
  private readonly config: web3.PublicKey;
  private readonly lp: web3.PublicKey;
  private readonly vault: web3.PublicKey;

  private constructor(private readonly connection: web3.Connection, private readonly programId: web3.PublicKey, private readonly keeper: web3.Keypair, program: Program<Idl>) {
    this.program = program as unknown as DynamicProgram;
    [this.config] = web3.PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
    [this.lp] = web3.PublicKey.findProgramAddressSync([Buffer.from("lp")], programId);
    [this.vault] = web3.PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
  }

  static async create(configuration: { programId: web3.PublicKey; keeper: web3.Keypair; rpcUrl: string; idl: Idl }): Promise<AnchorChainTransport> {
    const connection = new web3.Connection(configuration.rpcUrl, "confirmed");
    const genesis = await connection.getGenesisHash();
    if (genesis !== DEVNET_GENESIS_HASH) throw new Error(`Refusing non-devnet RPC (genesis ${genesis})`);
    const executable = await connection.getAccountInfo(configuration.programId, "confirmed");
    if (!executable?.executable) throw new Error(`Wick program ${configuration.programId.toBase58()} is not executable on devnet`);
    const provider = new AnchorProvider(connection, new Wallet(configuration.keeper), { commitment: "confirmed", preflightCommitment: "confirmed" });
    const program = new Program(configuration.idl, provider);
    const transport = new AnchorChainTransport(connection, configuration.programId, configuration.keeper, program);
    const config = await transport.account("config").fetch(transport.config);
    if (!publicKey(config.keeper, "config.keeper").equals(configuration.keeper.publicKey)) throw new Error("KEEPER_KEYPAIR does not match the on-chain Wick config keeper");
    return transport;
  }

  async marketExists(symbol: string, signal?: AbortSignal): Promise<boolean> {
    throwIfAborted(signal);
    return (await this.connection.getAccountInfo(this.marketPda(symbol), "confirmed")) !== null;
  }

  async createMarket(request: CreateMarketRequest, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const digest = symbolHash(request.symbol);
    return this.send(this.method("createMarket")(request.symbol, [...digest], request.kind === "up_down" ? { upDown: {} } : { ladder: {} }, new BN(request.strikeUsdE6.toString()), new BN(request.openTs), new BN(request.expiryTs), request.cutoffSecs, request.halfSpreadE6).accountsStrict({
      keeper: this.keeper.publicKey, config: this.config, market: this.marketPda(request.symbol), systemProgram: web3.SystemProgram.programId,
    }), signal);
  }

  async updateMarks(requests: readonly MarkUpdateRequest[], priorityFeeMicroLamports: number, signal?: AbortSignal): Promise<string> {
    if (requests.length === 0) throw new Error("updateMarks requires at least one market");
    throwIfAborted(signal);
    const remaining = requests.map((request) => ({ pubkey: this.marketPda(request.symbol), isSigner: false, isWritable: true }));
    let builder = this.method("updateMarks")(requests.map((request, marketIndex) => ({ marketIndex, markE6: request.markE6, maxLeverage: request.maxLeverage }))).accountsStrict({ keeper: this.keeper.publicKey, config: this.config }).remainingAccounts(remaining);
    if (priorityFeeMicroLamports > 0) builder = builder.preInstructions([web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports })]);
    return this.send(builder, signal);
  }

  async listOpenPositions(signal?: AbortSignal): Promise<readonly OpenPositionRef[]> {
    throwIfAborted(signal);
    const rows = await this.account("position").all();
    const result: OpenPositionRef[] = [];
    const symbols = new Map<string, string>();
    for (const row of rows) {
      if (variantName(row.account.status) !== "open") continue;
      const marketKey = publicKey(row.account.market, "position.market");
      let symbol = symbols.get(marketKey.toBase58());
      if (!symbol) {
        symbol = decodeSymbol(await this.account("market").fetch(marketKey));
        symbols.set(marketKey.toBase58(), symbol);
      }
      result.push({ address: row.publicKey.toBase58(), symbol, side: variantName(row.account.side) === "yes" ? "yes" : "no", liqMarkE6: numberValue(row.account.liqMarkE6, "position.liqMarkE6") });
    }
    return result;
  }

  async listSettlementMarkets(signal?: AbortSignal): Promise<readonly SettlementMarketRef[]> {
    throwIfAborted(signal);
    return (await this.account("market").all()).map((row) => ({
      symbol: decodeSymbol(row.account),
      expiryTs: numberValue(row.account.expiryTs, "market.expiryTs"),
      status: settlementMarketStatus(row.account.status),
    }));
  }

  async liquidate(positionAddress: string, signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const positionKey = new web3.PublicKey(positionAddress);
    const position = await this.account("position").fetch(positionKey);
    const owner = publicKey(position.owner, "position.owner");
    const market = publicKey(position.market, "position.market");
    const loserMint = publicKey((await this.account("lpState").fetch(this.lp)).loserMint, "lp.loserMint");
    return this.send(this.method("liquidate")().accountsStrict({
      liquidator: this.keeper.publicKey, config: this.config, market, position: positionKey, owner, lp: this.lp, loserMint,
      ownerWicked: getAssociatedTokenAddressSync(loserMint, owner), tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
    }), signal);
  }

  async settleMarket(symbol: string, outcome: "yes" | "no", settlementValueE6: bigint, signal?: AbortSignal): Promise<string> {
    return this.send(this.method("settleMarket")(outcome === "yes" ? { yes: {} } : { no: {} }, new BN(settlementValueE6.toString())).accountsStrict({ keeper: this.keeper.publicKey, config: this.config, market: this.marketPda(symbol) }), signal);
  }

  async voidMarket(symbol: string, signal?: AbortSignal): Promise<string> {
    return this.send(this.method("voidMarket")().accountsStrict({ keeper: this.keeper.publicKey, config: this.config, market: this.marketPda(symbol) }), signal);
  }

  async settleOpenPositions(symbol: string, signal?: AbortSignal): Promise<readonly string[]> {
    throwIfAborted(signal);
    const market = this.marketPda(symbol);
    const rows = await this.account("position").all();
    const signatures: string[] = [];
    for (const row of rows) {
      if (variantName(row.account.status) !== "open" || !publicKey(row.account.market, "position.market").equals(market)) continue;
      const owner = publicKey(row.account.owner, "position.owner");
      const config = await this.account("config").fetch(this.config);
      const lpState = await this.account("lpState").fetch(this.lp);
      const usdcMint = publicKey(config.usdcMint, "config.usdcMint");
      const loserMint = publicKey(lpState.loserMint, "lp.loserMint");
      const claimIndex = bigintValue(lpState.queueTail, "lp.queueTail");
      const [claim] = web3.PublicKey.findProgramAddressSync([Buffer.from("claim"), u64le(claimIndex)], this.programId);
      signatures.push(await this.send(this.method("settlePosition")(new BN(claimIndex.toString())).accountsStrict({
        payer: this.keeper.publicKey, config: this.config, market, position: row.publicKey, owner, lp: this.lp, vault: this.vault,
        usdcMint, ownerUsdc: getAssociatedTokenAddressSync(usdcMint, owner), loserMint,
        ownerWicked: getAssociatedTokenAddressSync(loserMint, owner), claim, tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
      }), signal));
    }
    return signatures;
  }

  async claimQueue(signal?: AbortSignal): Promise<readonly string[]> {
    const signatures: string[] = [];
    for (let iteration = 0; iteration < 100; iteration += 1) {
      throwIfAborted(signal);
      const lpState = await this.account("lpState").fetch(this.lp);
      if (bigintValue(lpState.queueOwed, "lp.queueOwed") === 0n) return signatures;
      const vaultAmount = BigInt((await this.connection.getTokenAccountBalance(this.vault, "confirmed")).value.amount);
      if (vaultAmount <= bigintValue(lpState.queueOwed, "lp.queueOwed")) return signatures;
      const head = bigintValue(lpState.queueHead, "lp.queueHead");
      const [claimKey] = web3.PublicKey.findProgramAddressSync([Buffer.from("claim"), u64le(head)], this.programId);
      const claim = await this.account("payoutClaim").fetch(claimKey);
      const owner = publicKey(claim.owner, "claim.owner");
      const usdcMint = publicKey((await this.account("config").fetch(this.config)).usdcMint, "config.usdcMint");
      signatures.push(await this.send(this.method("claimQueue")().accountsStrict({
        payer: this.keeper.publicKey, config: this.config, lp: this.lp, vault: this.vault, usdcMint, claim: claimKey, owner,
        ownerUsdc: getAssociatedTokenAddressSync(usdcMint, owner), tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID, systemProgram: web3.SystemProgram.programId,
      }), signal));
    }
    throw new Error("claimQueue exceeded 100 confirmed crank transactions");
  }

  private marketPda(symbol: string): web3.PublicKey { return web3.PublicKey.findProgramAddressSync([Buffer.from("market"), symbolHash(symbol)], this.programId)[0]; }
  private method(name: string): (...args: unknown[]) => MethodBuilder {
    const method = this.program.methods[name];
    if (!method) throw new Error(`Generated Wick client has no ${name} method`);
    return method;
  }
  private account(name: string): AccountClient {
    const account = this.program.account[name];
    if (!account) throw new Error(`Generated Wick client has no ${name} account decoder`);
    return account;
  }
  private async send(builder: MethodBuilder, signal?: AbortSignal): Promise<string> {
    return submitAndConfirmTransaction(builder, this.connection, signal);
  }
}

export async function submitAndConfirmTransaction(builder: TransactionBuilder, confirmer: TransactionConfirmer, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const signature = await abortable(builder.rpc(), signal);
  throwIfAborted(signal);
  const confirmation = await abortable(confirmer.confirmTransaction(signature, "confirmed"), signal);
  throwIfAborted(signal);
  if (confirmation.value.err) throw new Error(`Wick transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
}

async function loadKeeperKeypair(value: string): Promise<web3.Keypair> {
  let bytes: Uint8Array;
  if (value.startsWith("[") && value.endsWith("]")) bytes = Uint8Array.from(JSON.parse(value) as number[]);
  else {
    try { bytes = Uint8Array.from(JSON.parse(await readFile(value, "utf8")) as number[]); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      try { bytes = bs58.decode(value); }
      catch { throw new Error("KEEPER_KEYPAIR must be a JSON keypair path, JSON byte array, or base58 secret"); }
    }
  }
  if (bytes.length !== 64) throw new Error("KEEPER_KEYPAIR must contain a 64-byte Solana secret key");
  return web3.Keypair.fromSecretKey(bytes);
}

function normalizeName(name: string): string { return name.replaceAll("_", "").toLowerCase(); }
function symbolHash(symbol: string): Buffer { return createHash("sha256").update(symbol).digest(); }
function u64le(value: bigint): Buffer { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(value); return bytes; }
function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw signal.reason ?? new Error("operation aborted"); }
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("operation aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new Error("operation aborted"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}
function variantName(value: unknown): string {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") return Object.keys(value)[0]?.toLowerCase() ?? "";
  return "";
}
function settlementMarketStatus(value: unknown): SettlementMarketStatus {
  const status = variantName(value);
  if (status === "open" || status === "halted" || status === "expired" || status === "settled" || status === "invalid") return status;
  throw new Error(`market.status has unsupported variant ${status || "unknown"}`);
}
function publicKey(value: unknown, label: string): web3.PublicKey {
  if (value instanceof web3.PublicKey) return value;
  if (typeof value === "string") return new web3.PublicKey(value);
  throw new Error(`${label} is not a public key`);
}
function bigintValue(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) return BigInt(String(value));
  throw new Error(`${label} is not an integer`);
}
function numberValue(value: unknown, label: string): number {
  const numeric = Number(bigintValue(value, label));
  if (!Number.isSafeInteger(numeric)) throw new Error(`${label} exceeds safe integer range`);
  return numeric;
}
function decodeSymbol(market: Record<string, unknown>): string {
  const length = numberValue(market.symbolLen, "market.symbolLen");
  const value = market.geminiSymbol;
  const bytes = Buffer.isBuffer(value) ? value : Array.isArray(value) ? Buffer.from(value as number[]) : undefined;
  if (!bytes || length < 1 || length > bytes.length) throw new Error("market.geminiSymbol is invalid");
  return bytes.subarray(0, length).toString("utf8");
}
