import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddress, getMint, type Mint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SOLANA_DEVNET_GENESIS_HASH } from "@wick/shared";

export const FAUCET_GRANT_E6 = 1_000_000_000n;
export const FAUCET_MAX_SUPPLY_E6 = 200n * FAUCET_GRANT_E6;
export const FAUCET_SOL_LAMPORTS = Math.round(0.05 * LAMPORTS_PER_SOL);
// Covers the 0.05 SOL transfer plus ATA rent and transaction fees with margin.
export const FAUCET_MIN_TREASURY_LAMPORTS = Math.round(0.06 * LAMPORTS_PER_SOL);

type MintSnapshot = Pick<Mint, "decimals" | "isInitialized" | "mintAuthority" | "supply">;
type MintReader = (connection: Connection, mint: PublicKey) => Promise<MintSnapshot>;
type TransactionSender = (connection: Connection, transaction: Transaction, signers: Keypair[]) => Promise<string>;
type TokenAccountDeriver = (mint: PublicKey, owner: PublicKey) => Promise<PublicKey>;

export interface SendFaucetGrantOptions {
  connection: Connection;
  mint: PublicKey;
  recipient: PublicKey;
  treasury: Keypair;
  authority: Keypair;
  readMint?: MintReader;
  sendTransaction?: TransactionSender;
  deriveTokenAccount?: TokenAccountDeriver;
}

export async function sendFaucetGrant(options: SendFaucetGrantOptions): Promise<string> {
  // This check must be the first network operation so a misconfigured RPC can
  // never transfer SOL or mint tokens on another Solana cluster.
  const genesis = await options.connection.getGenesisHash();
  if (genesis !== SOLANA_DEVNET_GENESIS_HASH) throw new Error(`Refusing non-devnet faucet RPC (genesis ${genesis})`);

  const treasuryBalance = await options.connection.getBalance(options.treasury.publicKey, "confirmed");
  if (treasuryBalance < FAUCET_MIN_TREASURY_LAMPORTS) throw new Error("Demo faucet treasury has insufficient devnet SOL");

  const mintInfo = await (options.readMint ?? (async (connection, mint) => getMint(connection, mint, "confirmed")))(options.connection, options.mint);
  if (!mintInfo.isInitialized || mintInfo.decimals !== 6 || !mintInfo.mintAuthority?.equals(options.authority.publicKey)) {
    throw new Error("Configured faucet authority does not control the initialized six-decimal test-USDC mint");
  }
  if (mintInfo.supply + FAUCET_GRANT_E6 > FAUCET_MAX_SUPPLY_E6) throw new Error("The 200-wallet demo faucet cap has been reached.");

  const ata = await (options.deriveTokenAccount ?? getAssociatedTokenAddress)(options.mint, options.recipient);
  const transaction = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: options.treasury.publicKey, toPubkey: options.recipient, lamports: FAUCET_SOL_LAMPORTS }),
    createAssociatedTokenAccountIdempotentInstruction(options.treasury.publicKey, ata, options.recipient, options.mint),
    createMintToInstruction(options.mint, ata, options.authority.publicKey, FAUCET_GRANT_E6),
  );
  const signers = options.authority.publicKey.equals(options.treasury.publicKey)
    ? [options.treasury]
    : [options.treasury, options.authority];
  return (options.sendTransaction ?? (async (connection, tx, txSigners) => sendAndConfirmTransaction(connection, tx, txSigners, { commitment: "confirmed" })))(options.connection, transaction, signers);
}
