import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddress, getMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { FAUCET_INVENTORY_E6, USDC_DECIMALS } from "../packages/shared/src/constants.js";
import { marketsResponseSchema } from "../packages/shared/src/schemas.js";
import { WICK_IDL } from "../packages/shared/src/idl.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadKeypair, loadOrCreateKeypair } from "./keypairs.js";
import { type BotMarket, type BotOpenRequest, type BotTransport, type BotWallet, runBots } from "./lib/bot-engine.js";
import { assertDevnet, fetchJson, integerEnv, requiredEnv, waitForConfirmedSignature } from "./lib/runtime.js";
import { runDemoCheck } from "./demo-check.js";

interface OpenBuilder {
  accounts(accounts: Record<string, PublicKey>): OpenBuilder;
  signers(signers: Keypair[]): OpenBuilder;
  rpc(options?: { commitment?: "confirmed" }): Promise<string>;
}

class DevnetBotTransport implements BotTransport {
  private readonly connection: Connection;
  private readonly programId: PublicKey;
  private readonly mint: PublicKey;
  private readonly backendUrl: string;
  private readonly treasury: Keypair;
  private readonly treasuryTokenAccount: PublicKey;
  private readonly wallets = new Map<string, Keypair>();

  private constructor(options: { connection: Connection; programId: PublicKey; mint: PublicKey; backendUrl: string; treasury: Keypair; treasuryTokenAccount: PublicKey }) {
    this.connection = options.connection; this.programId = options.programId; this.mint = options.mint;
    this.backendUrl = options.backendUrl; this.treasury = options.treasury; this.treasuryTokenAccount = options.treasuryTokenAccount;
  }

  static async create(): Promise<DevnetBotTransport> {
    if ((WICK_IDL.instructions as readonly unknown[]).length === 0) throw new Error("Generated Wick IDL is empty; bots cannot submit real positions");
    const programId = new PublicKey(requiredEnv("PROGRAM_ID"));
    if (programId.toBase58() !== WICK_IDL.address) throw new Error("PROGRAM_ID does not match generated IDL");
    const backendUrl = requiredEnv("NEXT_PUBLIC_BACKEND_URL").replace(/\/$/, "");
    const parsed = new URL(backendUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error("NEXT_PUBLIC_BACKEND_URL must use HTTPS");
    const connection = new Connection(process.env.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com", "confirmed");
    await assertDevnet(connection);
    const deployed = await connection.getAccountInfo(programId, "confirmed");
    if (!deployed?.executable) throw new Error("Wick program is not executable on devnet");
    const mint = new PublicKey(requiredEnv("USDC_TEST_MINT"));
    const treasury = await loadKeypair(requiredEnv("TREASURY_KEYPAIR"), "TREASURY_KEYPAIR");
    const mintInfo = await getMint(connection, mint, "confirmed");
    if (!mintInfo.isInitialized || mintInfo.decimals !== USDC_DECIMALS || mintInfo.supply !== FAUCET_INVENTORY_E6 || mintInfo.mintAuthority !== null || mintInfo.freezeAuthority !== null) {
      throw new Error("Configured test-USDC mint is not the finite authority-revoked faucet mint");
    }
    const treasuryTokenAccount = await getAssociatedTokenAddress(mint, treasury.publicKey);
    const inventory = await getAccount(connection, treasuryTokenAccount, "confirmed");
    if (!inventory.isInitialized || inventory.isFrozen || !inventory.mint.equals(mint) || !inventory.owner.equals(treasury.publicKey)) {
      throw new Error("Treasury test-USDC inventory account is invalid");
    }
    return new DevnetBotTransport({ connection, programId, mint, backendUrl, treasury, treasuryTokenAccount });
  }

  async prepareWallet(index: number): Promise<BotWallet> {
    const keypair = await loadOrCreateKeypair(`.keys/bots/bot-${index}.json`);
    const id = keypair.publicKey.toBase58();
    this.wallets.set(id, keypair);
    const ata = await getAssociatedTokenAddress(this.mint, keypair.publicKey);
    const [solBalance, tokenBalance] = await Promise.all([
      this.connection.getBalance(keypair.publicKey, "confirmed"),
      this.connection.getTokenAccountBalance(ata, "confirmed").then((value) => BigInt(value.value.amount)).catch(() => 0n),
    ]);
    const transaction = new Transaction();
    if (solBalance < 100_000_000) transaction.add(SystemProgram.transfer({ fromPubkey: this.treasury.publicKey, toPubkey: keypair.publicKey, lamports: 100_000_000 - solBalance }));
    if (tokenBalance < 500_000_000n) transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(this.treasury.publicKey, ata, keypair.publicKey, this.mint),
      createTransferCheckedInstruction(this.treasuryTokenAccount, this.mint, ata, this.treasury.publicKey, 500_000_000n - tokenBalance, USDC_DECIMALS),
    );
    if (transaction.instructions.length > 0) {
      const treasuryBalance = await this.connection.getBalance(this.treasury.publicKey, "confirmed");
      if (treasuryBalance < LAMPORTS_PER_SOL) throw new Error("Treasury has less than 1 devnet SOL; bot funding stopped");
      await sendAndConfirmTransaction(this.connection, transaction, [this.treasury], { commitment: "confirmed" });
    }
    return { id };
  }

  async listMarkets(): Promise<BotMarket[]> {
    const markets = marketsResponseSchema.parse(await fetchJson<unknown>(`${this.backendUrl}/markets`));
    return markets.map((market) => ({ symbol: market.symbol, status: market.status, expiryTs: market.expiryTs, maxLeverage: market.maxLeverage }));
  }

  async openPosition(request: BotOpenRequest): Promise<string> {
    const signer = this.wallets.get(request.wallet.id);
    if (!signer) throw new Error("Bot wallet was not prepared");
    const symbolHash = createHash("sha256").update(request.market.symbol).digest();
    const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], this.programId);
    const [market] = PublicKey.findProgramAddressSync([Buffer.from("market"), symbolHash], this.programId);
    const [lp] = PublicKey.findProgramAddressSync([Buffer.from("lp")], this.programId);
    const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], this.programId);
    const nonce = Buffer.alloc(8); nonce.writeBigUInt64LE(request.nonce);
    const [position] = PublicKey.findProgramAddressSync([Buffer.from("pos"), market.toBuffer(), signer.publicKey.toBuffer(), nonce], this.programId);
    const traderUsdc = await getAssociatedTokenAddress(this.mint, signer.publicKey);
    const provider = new AnchorProvider(this.connection, new Wallet(signer), { commitment: "confirmed" });
    const program = new Program(WICK_IDL as unknown as Idl, provider);
    const methods = program.methods as unknown as { openPosition(side: Record<string, Record<string, never>>, margin: BN, leverage: number, maxEntryE6: number, nonce: BN): OpenBuilder };
    const side = request.side === "yes" ? { yes: {} } : { no: {} };
    const signature = await methods.openPosition(side, new BN(request.marginE6.toString()), request.leverage, 990_000, new BN(request.nonce.toString()))
      .accounts({ trader: signer.publicKey, config, market, lp, vault, usdcMint: this.mint, traderUsdc, position, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
      .signers([signer]).rpc({ commitment: "confirmed" });
    await waitForConfirmedSignature(this.connection, signature);
    return signature;
  }
}

async function main(): Promise<void> {
  const count = integerEnv("BOT_COUNT", 10);
  const minutes = integerEnv("BOT_MINUTES", 30);
  const intervalMs = integerEnv("BOT_INTERVAL_MS", 3_000);
  const transport = await DevnetBotTransport.create();
  const markets = await transport.listMarkets();
  if (process.argv.includes("--dry-run")) {
    console.info(JSON.stringify({ event: "bots_dry_run", count, minutes, intervalMs, liveMarkets: markets.filter((market) => market.status === "open" && market.expiryTs > Date.now()).length, submitted: false }));
    return;
  }
  const result = await runBots(transport, { count, durationMs: minutes * 60_000, intervalMs, onResult: (current) => console.info(JSON.stringify({ event: "bot_progress", attempted: current.attempted, opened: current.opened, failed: current.failed })) });
  console.info(JSON.stringify({ event: "bots_complete", ...result, signatures: result.signatures.slice(-10) }));
  if (result.failed > 0) throw new Error(`${result.failed} bot transactions failed; the run is not error-free`);
  const verification = await runDemoCheck();
  console.info(JSON.stringify({ event: "bots_verified", vaultBalanceE6: verification.vaultBalanceE6, liveMarket: verification.liveMarket }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
