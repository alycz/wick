import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAccount, getAssociatedTokenAddress, getMint, type Account, type Mint } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { FAUCET_GRANT_E6, FAUCET_INVENTORY_E6, SOLANA_DEVNET_GENESIS_HASH, USDC_DECIMALS } from "@wick/shared";

export { FAUCET_GRANT_E6 };
export const FAUCET_MAX_SUPPLY_E6 = FAUCET_INVENTORY_E6;
export const FAUCET_SOL_LAMPORTS = Math.round(0.05 * LAMPORTS_PER_SOL);
// Covers the 0.05 SOL transfer plus ATA rent and transaction fees with margin.
export const FAUCET_MIN_TREASURY_LAMPORTS = Math.round(0.06 * LAMPORTS_PER_SOL);

type MintSnapshot = Pick<Mint, "decimals" | "freezeAuthority" | "isInitialized" | "mintAuthority" | "supply">;
type TokenAccountSnapshot = Pick<Account, "amount" | "isFrozen" | "isInitialized" | "mint" | "owner">;
type MintReader = (connection: Connection, mint: PublicKey) => Promise<MintSnapshot>;
type TokenAccountReader = (connection: Connection, account: PublicKey) => Promise<TokenAccountSnapshot>;
type TransactionSender = (connection: Connection, transaction: Transaction, signers: Keypair[]) => Promise<string>;
type TokenAccountDeriver = (mint: PublicKey, owner: PublicKey) => Promise<PublicKey>;

export class FaucetInventoryDepletedError extends Error {
  constructor() {
    super("The finite 200-grant demo faucet inventory has been depleted.");
    this.name = "FaucetInventoryDepletedError";
  }
}

export interface SendFaucetGrantOptions {
  connection: Connection;
  mint: PublicKey;
  recipient: PublicKey;
  treasury: Keypair;
  readMint?: MintReader;
  readTokenAccount?: TokenAccountReader;
  sendTransaction?: TransactionSender;
  deriveTokenAccount?: TokenAccountDeriver;
}

export async function sendFaucetGrant(options: SendFaucetGrantOptions): Promise<string> {
  // This check must be the first network operation so a misconfigured RPC can
  // never transfer SOL or mint tokens on another Solana cluster.
  const genesis = await options.connection.getGenesisHash();
  if (genesis !== SOLANA_DEVNET_GENESIS_HASH) throw new Error(`Refusing non-devnet faucet RPC (genesis ${genesis})`);

  const treasuryBalance = await options.connection.getBalance(options.treasury.publicKey, "confirmed");
  if (treasuryBalance < FAUCET_MIN_TREASURY_LAMPORTS) throw new Error("Test faucet treasury has insufficient devnet SOL");

  const mintInfo = await (options.readMint ?? (async (connection, mint) => getMint(connection, mint, "confirmed")))(options.connection, options.mint);
  if (!mintInfo.isInitialized || mintInfo.decimals !== USDC_DECIMALS) {
    throw new Error("Configured faucet mint is not initialized six-decimal test USDC");
  }
  if (mintInfo.mintAuthority !== null || mintInfo.freezeAuthority !== null) {
    throw new Error("Configured faucet mint authorities are not permanently revoked");
  }
  if (mintInfo.supply !== FAUCET_MAX_SUPPLY_E6) {
    throw new Error("Configured faucet mint does not have the exact finite 200-grant supply");
  }

  const deriveTokenAccount = options.deriveTokenAccount ?? getAssociatedTokenAddress;
  const treasuryAta = await deriveTokenAccount(options.mint, options.treasury.publicKey);
  const recipientAta = await deriveTokenAccount(options.mint, options.recipient);
  const treasuryInventory = await (options.readTokenAccount ?? (async (connection, account) => getAccount(connection, account, "confirmed")))(options.connection, treasuryAta);
  if (!treasuryInventory.isInitialized || treasuryInventory.isFrozen || !treasuryInventory.mint.equals(options.mint) || !treasuryInventory.owner.equals(options.treasury.publicKey)) {
    throw new Error("Configured faucet treasury token account is invalid");
  }
  if (treasuryInventory.amount < FAUCET_GRANT_E6) throw new FaucetInventoryDepletedError();

  const transaction = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: options.treasury.publicKey, toPubkey: options.recipient, lamports: FAUCET_SOL_LAMPORTS }),
    createAssociatedTokenAccountIdempotentInstruction(options.treasury.publicKey, recipientAta, options.recipient, options.mint),
    createTransferCheckedInstruction(treasuryAta, options.mint, recipientAta, options.treasury.publicKey, FAUCET_GRANT_E6, USDC_DECIMALS),
  );
  return (options.sendTransaction ?? (async (connection, tx, signers) => sendAndConfirmTransaction(connection, tx, signers, { commitment: "confirmed" })))(options.connection, transaction, [options.treasury]);
}
