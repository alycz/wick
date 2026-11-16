import { createMint, getMint } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { PUBLIC_DEVNET_RPC, USDC_DECIMALS } from "../packages/shared/src/constants.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadKeypair } from "./keypairs.js";
import { assertDevnet, requiredEnv } from "./lib/runtime.js";

export async function createOrVerifyMint(environment: NodeJS.ProcessEnv = process.env): Promise<PublicKey> {
  const authority = await loadKeypair(requiredEnv("FAUCET_AUTHORITY_KEYPAIR", environment), "FAUCET_AUTHORITY_KEYPAIR");
  const payer = await loadKeypair(requiredEnv("TREASURY_KEYPAIR", environment), "TREASURY_KEYPAIR");
  const connection = new Connection(environment.PUBLIC_SOLANA_RPC_URL?.trim() || PUBLIC_DEVNET_RPC, "confirmed");
  await assertDevnet(connection);
  const configured = environment.USDC_TEST_MINT?.trim();
  if (configured) {
    const mint = new PublicKey(configured);
    const info = await getMint(connection, mint, "confirmed");
    if (info.decimals !== USDC_DECIMALS) throw new Error(`Configured mint has ${info.decimals} decimals, expected ${USDC_DECIMALS}`);
    if (!info.mintAuthority?.equals(authority.publicKey)) throw new Error("Configured mint authority does not match FAUCET_AUTHORITY_KEYPAIR");
    console.info(JSON.stringify({ event: "test_usdc_verified", mint: mint.toBase58(), decimals: info.decimals, cluster: "devnet" }));
    return mint;
  }
  const balance = await connection.getBalance(payer.publicKey, "confirmed");
  if (balance === 0) throw new Error("Treasury has no devnet SOL; mint creation was not submitted");
  const mint = await createMint(connection, payer, authority.publicKey, authority.publicKey, USDC_DECIMALS, undefined, { commitment: "confirmed" });
  const info = await getMint(connection, mint, "confirmed");
  if (info.decimals !== USDC_DECIMALS || !info.mintAuthority?.equals(authority.publicKey)) throw new Error("Created mint failed read-back verification");
  console.info(JSON.stringify({ event: "test_usdc_created", mint: mint.toBase58(), decimals: info.decimals, cluster: "devnet" }));
  return mint;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await createOrVerifyMint();
