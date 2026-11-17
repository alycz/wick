import {
  AuthorityType,
  createAssociatedTokenAccountIdempotentInstruction,
  createMint,
  createMintToInstruction,
  createSetAuthorityInstruction,
  getAccount,
  getAssociatedTokenAddress,
  getMint,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction, type Signer } from "@solana/web3.js";
import { FAUCET_GRANT_E6, FAUCET_INVENTORY_E6, PUBLIC_DEVNET_RPC, USDC_DECIMALS } from "../packages/shared/src/constants.js";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { loadKeypair } from "./keypairs.js";
import { assertDevnet, requiredEnv } from "./lib/runtime.js";

function uniqueSigners(signers: Keypair[]): Signer[] {
  return signers.filter((signer, index) => signers.findIndex((candidate) => candidate.publicKey.equals(signer.publicKey)) === index);
}

/**
 * Provision the one finite faucet inventory. The final transaction mints the
 * remaining capped supply to the treasury ATA and permanently revokes both
 * mint authorities. Re-running this function only verifies an already-revoked
 * mint; it can never refill inventory.
 */
export async function createOrVerifyMint(environment: NodeJS.ProcessEnv = process.env): Promise<PublicKey> {
  const payer = await loadKeypair(requiredEnv("TREASURY_KEYPAIR", environment), "TREASURY_KEYPAIR");
  const connection = new Connection(environment.PUBLIC_SOLANA_RPC_URL?.trim() || PUBLIC_DEVNET_RPC, "confirmed");
  await assertDevnet(connection);

  const configured = environment.USDC_TEST_MINT?.trim();
  let mint: PublicKey;
  let authority: Keypair | undefined;
  if (configured) {
    mint = new PublicKey(configured);
  } else {
    authority = await loadKeypair(requiredEnv("FAUCET_AUTHORITY_KEYPAIR", environment), "FAUCET_AUTHORITY_KEYPAIR");
    const balance = await connection.getBalance(payer.publicKey, "confirmed");
    if (balance === 0) throw new Error("Treasury has no devnet SOL; mint creation was not submitted");
    mint = await createMint(connection, payer, authority.publicKey, authority.publicKey, USDC_DECIMALS, undefined, { commitment: "confirmed" });
  }

  let info = await getMint(connection, mint, "confirmed");
  if (!info.isInitialized || info.decimals !== USDC_DECIMALS) {
    throw new Error(`Configured mint is not initialized with ${USDC_DECIMALS} decimals`);
  }
  if (info.supply > FAUCET_INVENTORY_E6) {
    throw new Error("Configured mint supply already exceeds the finite 200-grant inventory");
  }

  const treasuryAta = await getAssociatedTokenAddress(mint, payer.publicKey);
  if (info.mintAuthority !== null || info.freezeAuthority !== null) {
    if (info.mintAuthority === null && info.supply < FAUCET_INVENTORY_E6) {
      throw new Error("Configured mint authority is already revoked before the finite inventory was fully provisioned");
    }
    authority ??= await loadKeypair(requiredEnv("FAUCET_AUTHORITY_KEYPAIR", environment), "FAUCET_AUTHORITY_KEYPAIR");
    if (info.mintAuthority !== null && !info.mintAuthority.equals(authority.publicKey)) {
      throw new Error("Configured mint authority does not match the one-time FAUCET_AUTHORITY_KEYPAIR");
    }
    if (info.freezeAuthority !== null && !info.freezeAuthority.equals(authority.publicKey)) {
      throw new Error("Configured freeze authority does not match the one-time FAUCET_AUTHORITY_KEYPAIR");
    }

    const transaction = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, treasuryAta, payer.publicKey, mint),
    );
    const deficit = FAUCET_INVENTORY_E6 - info.supply;
    if (deficit > 0n) transaction.add(createMintToInstruction(mint, treasuryAta, authority.publicKey, deficit));
    if (info.mintAuthority !== null) {
      transaction.add(createSetAuthorityInstruction(mint, authority.publicKey, AuthorityType.MintTokens, null));
    }
    if (info.freezeAuthority !== null) {
      transaction.add(createSetAuthorityInstruction(mint, authority.publicKey, AuthorityType.FreezeAccount, null));
    }
    await sendAndConfirmTransaction(connection, transaction, uniqueSigners([payer, authority]), { commitment: "confirmed" });
    info = await getMint(connection, mint, "confirmed");
  }

  if (info.supply !== FAUCET_INVENTORY_E6 || info.mintAuthority !== null || info.freezeAuthority !== null) {
    throw new Error("Finite faucet mint failed read-back: exact supply and revoked authorities are required");
  }
  const inventory = await getAccount(connection, treasuryAta, "confirmed");
  if (!inventory.isInitialized || inventory.isFrozen || !inventory.mint.equals(mint) || !inventory.owner.equals(payer.publicKey)) {
    throw new Error("Finite faucet treasury token account failed read-back verification");
  }
  const remainingGrants = inventory.amount / FAUCET_GRANT_E6;
  console.info(JSON.stringify({
    event: configured ? "test_usdc_inventory_verified" : "test_usdc_inventory_created",
    mint: mint.toBase58(),
    treasuryTokenAccount: treasuryAta.toBase58(),
    decimals: info.decimals,
    supplyE6: info.supply.toString(),
    remainingGrants: remainingGrants.toString(),
    mintAuthorityRevoked: true,
    freezeAuthorityRevoked: true,
    cluster: "devnet",
  }));
  return mint;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await createOrVerifyMint();
