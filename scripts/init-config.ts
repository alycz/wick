import { AnchorProvider, BN, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, type Keypair } from "@solana/web3.js";
import { WICK_IDL } from "../packages/shared/src/idl.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadKeypair } from "./keypairs.js";
import { assertDevnet, requiredEnv, waitForConfirmedSignature } from "./lib/runtime.js";

interface InitBuilder {
  accounts(accounts: Record<string, PublicKey>): InitBuilder;
  signers(signers: Keypair[]): InitBuilder;
  rpc(options?: { commitment?: "confirmed" }): Promise<string>;
}

export async function initConfig(options: { verifyOnly?: boolean } = {}): Promise<void> {
  if (WICK_IDL.instructions.length === 0) throw new Error("Generated Wick IDL is empty; run the verified WP2 Anchor build/export before init-config");
  const programId = new PublicKey(requiredEnv("PROGRAM_ID"));
  if (programId.toBase58() !== WICK_IDL.address) throw new Error("PROGRAM_ID does not match packages/shared generated IDL address");
  const usdcMint = new PublicKey(requiredEnv("USDC_TEST_MINT"));
  const admin = await loadKeypair(requiredEnv("ADMIN_KEYPAIR"), "ADMIN_KEYPAIR");
  const keeper = await loadKeypair(requiredEnv("KEEPER_KEYPAIR"), "KEEPER_KEYPAIR");
  const rpcUrl = process.env.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  await assertDevnet(connection);
  const deployed = await connection.getAccountInfo(programId, "confirmed");
  if (!deployed?.executable) throw new Error("Configured Wick program is not deployed/executable on devnet");
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
  const [lp] = PublicKey.findProgramAddressSync([Buffer.from("lp")], programId);
  const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], programId);
  const [loserMint] = PublicKey.findProgramAddressSync([Buffer.from("wicked")], programId);
  const [stakingVault] = PublicKey.findProgramAddressSync([Buffer.from("staking_vault")], programId);
  const existing = await connection.getAccountInfo(config, "confirmed");
  if (options.verifyOnly || existing) {
    if (!existing?.owner.equals(programId)) throw new Error("Config PDA is missing or not owned by Wick");
    console.info(JSON.stringify({ event: "config_verified", programId: programId.toBase58(), config: config.toBase58(), lp: lp.toBase58(), vault: vault.toBase58(), loserMint: loserMint.toBase58(), stakingVault: stakingVault.toBase58() }));
    return;
  }
  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
  const program = new Program(WICK_IDL as unknown as Idl, provider);
  const methods = program.methods as unknown as { initConfig(params: Record<string, unknown>): InitBuilder };
  const signature = await methods.initConfig({
    keeper: keeper.publicKey,
    globalMaxLeverage: 1_000,
    maintenanceBps: 0,
    profitFeeBps: 200,
    liqFeeBps: 200,
    maxPayoutBpsOfVault: 2_000,
    maxMarketExposureBps: 5_000,
    liabilityAllowance: new BN(500_000_000),
    staleAfterSecs: 6,
    emissionThreshold: new BN(10_000_000_000),
    emissionC: new BN(10_000_000_000),
    stakerCap: new BN(100_000_000_000),
  }).accounts({ admin: admin.publicKey, config, lp, usdcMint, vault, loserMint, stakingVault, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY }).signers([admin]).rpc({ commitment: "confirmed" });
  await waitForConfirmedSignature(connection, signature);
  const created = await connection.getAccountInfo(config, "confirmed");
  if (!created?.owner.equals(programId)) throw new Error("init_config confirmed but config PDA read-back failed");
  console.info(JSON.stringify({ event: "config_initialized", signature, config: config.toBase58(), lp: lp.toBase58(), vault: vault.toBase58(), loserMint: loserMint.toBase58(), stakingVault: stakingVault.toBase58() }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await initConfig({ verifyOnly: process.argv.includes("--verify-only") });
