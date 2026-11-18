import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, type Commitment, type TransactionSignature } from "@solana/web3.js";
import { DEVNET_PROGRAM_ID, DEVNET_USDC_TEST_MINT, PUBLIC_DEVNET_RPC, WICK_IDL } from "@wick/shared";

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const encode = (value: string): Uint8Array => new TextEncoder().encode(value);
const CONFIG_SEED = encode("config");
const LP_SEED = encode("lp");
const VAULT_SEED = encode("vault");
const MARKET_SEED = encode("market");
const POSITION_SEED = encode("pos");
const CLAIM_SEED = encode("claim");
const STAKE_SEED = encode("stake");
const STAKING_VAULT_SEED = encode("staking_vault");

export interface ChainEnvironment { programId: PublicKey; usdcMint: PublicKey; rpcUrl: string }
export interface ChainEnvironmentVariables {
  NEXT_PUBLIC_PROGRAM_ID?: string | undefined;
  NEXT_PUBLIC_USDC_TEST_MINT?: string | undefined;
  NEXT_PUBLIC_RPC_URL?: string | undefined;
}
export interface ProgramMethodBuilder { accounts(accounts: Record<string, PublicKey>): { rpc(options?: { commitment?: Commitment }): Promise<TransactionSignature> } }
export interface ProgramFacade {
  readonly programId: PublicKey;
  readonly methods: Record<string, (...args: unknown[]) => ProgramMethodBuilder>;
  readonly account: Record<string, { fetch(address: PublicKey): Promise<Record<string, unknown>> }>;
}
export interface ConfirmingConnection {
  getGenesisHash(): Promise<string>;
  confirmTransaction(signature: string, commitment: Commitment): Promise<{ value: { err: unknown } }>;
}
export interface OpenPositionInput { symbol: string; side: "yes" | "no"; marginE6: bigint; leverage: number; maxEntryE6: number; nonce?: bigint }
export interface PositionActionInput { address: string; market: string; owner: string }
export interface ClaimActionInput { address: string; owner: string }

function browserChainEnvironment(): ChainEnvironmentVariables {
  // Keep these as literal property reads so Next.js replaces NEXT_PUBLIC values
  // in the browser bundle. Passing `process.env` through an alias is not inlined.
  return {
    NEXT_PUBLIC_PROGRAM_ID: process.env.NEXT_PUBLIC_PROGRAM_ID || DEVNET_PROGRAM_ID,
    NEXT_PUBLIC_USDC_TEST_MINT: process.env.NEXT_PUBLIC_USDC_TEST_MINT || DEVNET_USDC_TEST_MINT,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || PUBLIC_DEVNET_RPC,
  };
}

export function chainConfigurationError(environment: ChainEnvironmentVariables = browserChainEnvironment()): string | undefined {
  const programValue = environment.NEXT_PUBLIC_PROGRAM_ID?.trim();
  if (!programValue) return "Trading isn't available yet: the Wick program ID isn't set.";
  const mintValue = environment.NEXT_PUBLIC_USDC_TEST_MINT?.trim();
  if (!mintValue) return "Trading isn't available yet: the USDC mint isn't set.";
  const rpcUrl = environment.NEXT_PUBLIC_RPC_URL?.trim();
  if (!rpcUrl) return "Trading isn't available yet: the Solana RPC URL isn't set.";
  if ((WICK_IDL.instructions as readonly unknown[]).length === 0) return "Trading is not configured: deploy Wick and export its generated IDL first.";
  try {
    const programId = new PublicKey(programValue);
    new PublicKey(mintValue);
    if (WICK_IDL.address !== programId.toBase58()) return "Trading is not configured: the generated IDL does not match the deployed program ID.";
  } catch {
    return "Trading is not configured: a Solana public key is invalid.";
  }
  return undefined;
}

export function readChainEnvironment(environment: ChainEnvironmentVariables = browserChainEnvironment()): ChainEnvironment {
  const error = chainConfigurationError(environment);
  if (error) throw new Error(error);
  return { programId: new PublicKey(environment.NEXT_PUBLIC_PROGRAM_ID!), usdcMint: new PublicKey(environment.NEXT_PUBLIC_USDC_TEST_MINT!), rpcUrl: environment.NEXT_PUBLIC_RPC_URL! };
}

export function createWickClient(wallet: Wallet, environment: ChainEnvironmentVariables = browserChainEnvironment()): WickBrowserClient {
  const configured = readChainEnvironment(environment);
  if (!wallet.publicKey) throw new Error("Create a test wallet or connect Phantom / Solflare first.");
  const connection = new Connection(configured.rpcUrl, "confirmed");
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
  const program = new Program(WICK_IDL as unknown as Idl, provider) as unknown as ProgramFacade;
  if (!program.programId.equals(configured.programId)) throw new Error("The generated IDL program address does not match NEXT_PUBLIC_PROGRAM_ID.");
  return new WickBrowserClient(program, connection, wallet.publicKey, configured.usdcMint);
}

export class WickBrowserClient {
  constructor(private readonly program: ProgramFacade, private readonly connection: ConfirmingConnection, readonly owner: PublicKey, readonly usdcMint: PublicKey) {}

  async openPosition(input: OpenPositionInput): Promise<string> {
    this.requireInstruction("openPosition");
    const nonce = input.nonce ?? randomU64();
    const symbolHash = new Uint8Array(await crypto.subtle.digest("SHA-256", encode(input.symbol)));
    const market = pda(this.program.programId, MARKET_SEED, symbolHash);
    const position = pda(this.program.programId, POSITION_SEED, market.toBytes(), this.owner.toBytes(), u64le(nonce));
    return this.submit("openPosition", [sideArg(input.side), new BN(input.marginE6.toString()), input.leverage, input.maxEntryE6, new BN(nonce.toString())], {
      trader: this.owner,
      config: pda(this.program.programId, CONFIG_SEED),
      market,
      lp: pda(this.program.programId, LP_SEED),
      vault: pda(this.program.programId, VAULT_SEED),
      usdcMint: this.usdcMint,
      traderUsdc: getAssociatedTokenAddressSync(this.usdcMint, this.owner),
      position,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  async closePosition(input: PositionActionInput, minExitE6: number): Promise<string> {
    const state = await this.poolState();
    return this.submit("closePosition", [minExitE6, new BN(state.queueTail.toString())], {
      owner: this.requireOwner(input.owner),
      config: pda(this.program.programId, CONFIG_SEED),
      market: new PublicKey(input.market),
      position: new PublicKey(input.address),
      lp: state.lp,
      vault: pda(this.program.programId, VAULT_SEED),
      usdcMint: this.usdcMint,
      ownerUsdc: getAssociatedTokenAddressSync(this.usdcMint, this.owner),
      loserMint: state.loserMint,
      ownerWicked: getAssociatedTokenAddressSync(state.loserMint, this.owner),
      claim: pda(this.program.programId, CLAIM_SEED, u64le(state.queueTail)),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  async settlePosition(input: PositionActionInput): Promise<string> {
    const state = await this.poolState();
    const owner = new PublicKey(input.owner);
    return this.submit("settlePosition", [new BN(state.queueTail.toString())], {
      payer: this.owner,
      config: pda(this.program.programId, CONFIG_SEED),
      market: new PublicKey(input.market),
      position: new PublicKey(input.address),
      owner,
      lp: state.lp,
      vault: pda(this.program.programId, VAULT_SEED),
      usdcMint: this.usdcMint,
      ownerUsdc: getAssociatedTokenAddressSync(this.usdcMint, owner),
      loserMint: state.loserMint,
      ownerWicked: getAssociatedTokenAddressSync(state.loserMint, owner),
      claim: pda(this.program.programId, CLAIM_SEED, u64le(state.queueTail)),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  async claimQueue(input: ClaimActionInput): Promise<string> {
    const state = await this.poolState();
    const owner = this.requireOwner(input.owner);
    return this.submit("claimQueue", [], {
      payer: this.owner,
      config: pda(this.program.programId, CONFIG_SEED),
      lp: state.lp,
      vault: pda(this.program.programId, VAULT_SEED),
      usdcMint: this.usdcMint,
      claim: new PublicKey(input.address),
      owner,
      ownerUsdc: getAssociatedTokenAddressSync(this.usdcMint, owner),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  async stake(amountE6: bigint): Promise<string> { return this.stakeOperation("stake", amountE6); }
  async unstake(amountE6: bigint): Promise<string> { return this.stakeOperation("unstake", amountE6); }

  async claimRewards(): Promise<string> {
    const state = await this.poolState();
    return this.submit("claimRewards", [], {
      owner: this.owner,
      lp: state.lp,
      vault: pda(this.program.programId, VAULT_SEED),
      usdcMint: this.usdcMint,
      ownerUsdc: getAssociatedTokenAddressSync(this.usdcMint, this.owner),
      stakeAccount: pda(this.program.programId, STAKE_SEED, this.owner.toBytes()),
      tokenProgram: TOKEN_PROGRAM_ID,
    });
  }

  private async stakeOperation(name: "stake" | "unstake", amountE6: bigint): Promise<string> {
    if (amountE6 <= 0n) throw new Error("Stake amount must be positive.");
    const state = await this.poolState();
    return this.submit(name, [new BN(amountE6.toString())], {
      owner: this.owner,
      lp: state.lp,
      loserMint: state.loserMint,
      ownerWicked: getAssociatedTokenAddressSync(state.loserMint, this.owner),
      stakingVault: pda(this.program.programId, STAKING_VAULT_SEED),
      stakeAccount: pda(this.program.programId, STAKE_SEED, this.owner.toBytes()),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    });
  }

  private async poolState(): Promise<{ lp: PublicKey; loserMint: PublicKey; queueTail: bigint }> {
    const lp = pda(this.program.programId, LP_SEED);
    const fetcher = this.program.account.lpState;
    if (!fetcher) throw new Error("The generated IDL is missing the LP state account definition.");
    const raw = await fetcher.fetch(lp);
    return { lp, loserMint: toPublicKey(raw.loserMint, "LP loser mint"), queueTail: toBigInt(raw.queueTail, "LP queue tail") };
  }

  private async submit(name: string, args: unknown[], accounts: Record<string, PublicKey>): Promise<string> {
    this.requireInstruction(name);
    await this.assertDevnet();
    const signature = await this.program.methods[name]!(...args).accounts(accounts).rpc({ commitment: "confirmed" });
    const confirmation = await this.connection.confirmTransaction(signature, "confirmed");
    if (confirmation.value.err) throw new Error(`Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`);
    return signature;
  }

  private requireInstruction(name: string): void {
    if (typeof this.program.methods[name] !== "function") throw new Error(`The generated IDL does not contain ${name}. Rebuild and export the deployed IDL.`);
  }
  private requireOwner(value: string): PublicKey {
    const owner = new PublicKey(value);
    if (!owner.equals(this.owner)) throw new Error("This action is only available to the position or claim owner.");
    return owner;
  }
  private async assertDevnet(): Promise<void> {
    const genesis = await this.connection.getGenesisHash();
    if (genesis !== DEVNET_GENESIS_HASH) throw new Error(`Refusing transaction: RPC is not Solana devnet (genesis ${genesis}).`);
  }
}

function pda(programId: PublicKey, ...seeds: Uint8Array[]): PublicKey { return PublicKey.findProgramAddressSync(seeds, programId)[0]; }
function sideArg(side: "yes" | "no"): Record<string, Record<string, never>> { return side === "yes" ? { yes: {} } : { no: {} }; }
function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new RangeError("u64 value is out of range");
  const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigUint64(0, value, true); return bytes;
}
function randomU64(): bigint { const bytes = crypto.getRandomValues(new Uint8Array(8)); return new DataView(bytes.buffer).getBigUint64(0, true); }
function toPublicKey(value: unknown, label: string): PublicKey {
  if (value instanceof PublicKey) return value;
  if (typeof value === "string") return new PublicKey(value);
  throw new Error(`${label} is missing from the on-chain LP account.`);
}
function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) { const text = String(value); if (/^\d+$/.test(text)) return BigInt(text); }
  throw new Error(`${label} is missing from the on-chain LP account.`);
}
