import { createMint } from "@solana/spl-token";
import { Connection } from "@solana/web3.js";
import { PUBLIC_DEVNET_RPC, USDC_DECIMALS } from "../packages/shared/src/constants.js";
import { loadOrCreateKeypair } from "./keypairs.js";

const authority = await loadOrCreateKeypair(process.env.FAUCET_AUTHORITY_KEYPAIR ?? ".keys/faucet-authority.json");
const payer = await loadOrCreateKeypair(process.env.TREASURY_KEYPAIR ?? ".keys/treasury.json");
const connection = new Connection(process.env.PUBLIC_SOLANA_RPC_URL ?? PUBLIC_DEVNET_RPC, "confirmed");
const mint = await createMint(connection, payer, authority.publicKey, authority.publicKey, USDC_DECIMALS);
console.info(JSON.stringify({ mint: mint.toBase58(), decimals: USDC_DECIMALS, cluster: "devnet" }));
