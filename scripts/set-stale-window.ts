import { AnchorProvider, Program, Wallet, type Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey, type Transaction } from "@solana/web3.js";
import { WICK_IDL } from "../packages/shared/src/idl.js";
import { loadKeypair } from "./keypairs.js";
import { assertDevnet, requiredEnv, waitForConfirmedSignature } from "./lib/runtime.js";

// Changes only `stale_after_secs` on the live config and keeps every other
// parameter as it is. Usage:
//   ADMIN_KEYPAIR=devnet-keys/admin.json pnpm set:stale 300
// A trade is rejected with StaleMark when the market's last keeper mark is
// older than this many seconds, so it must be longer than the keeper's
// longest normal pause between mark batches.
const seconds = Number(process.argv[2]);
if (!Number.isInteger(seconds) || seconds <= 0) throw new Error("Pass the new window in whole seconds, for example: pnpm set:stale 300");

const admin = await loadKeypair(requiredEnv("ADMIN_KEYPAIR"), "ADMIN_KEYPAIR");
const connection = new Connection(process.env.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com", "confirmed");
await assertDevnet(connection);
const program = new Program(WICK_IDL as unknown as Idl, new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" }));
const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
const accounts = program.account as unknown as { config: { fetch(address: PublicKey): Promise<Record<string, unknown>> } };
const current = await accounts.config.fetch(config);
const keep = ["globalMaxLeverage", "maintenanceBps", "profitFeeBps", "liqFeeBps", "maxPayoutBpsOfVault", "maxMarketExposureBps", "liabilityAllowance", "emissionThreshold", "emissionC", "stakerCap"] as const;
const params: Record<string, unknown> = Object.fromEntries(keep.map((key) => [key, current[key]]));
params.staleAfterSecs = seconds;
const methods = program.methods as unknown as { setParams(params: Record<string, unknown>): { accounts(accounts: Record<string, PublicKey>): { transaction(): Promise<Transaction> } } };
// Send and poll rather than `.rpc()`, which needs a websocket for confirmation.
const transaction = await methods.setParams(params).accounts({ admin: admin.publicKey, config }).transaction();
transaction.feePayer = admin.publicKey;
transaction.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
transaction.sign(admin);
const signature = await connection.sendRawTransaction(transaction.serialize());
await waitForConfirmedSignature(connection, signature);
const after = await accounts.config.fetch(config);
console.info(JSON.stringify({ event: "stale_window_updated", signature, before: current.staleAfterSecs, after: after.staleAfterSecs }));
