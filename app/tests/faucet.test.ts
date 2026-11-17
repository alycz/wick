// @vitest-environment node
import { Keypair, PublicKey } from "@solana/web3.js";
import { FAUCET_INVENTORY_E6, SOLANA_DEVNET_GENESIS_HASH } from "@wick/shared";
import { describe, expect, it, vi } from "vitest";
import { FAUCET_GRANT_E6, FAUCET_MIN_TREASURY_LAMPORTS, sendFaucetGrant } from "@/lib/faucet";

const mint = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const treasury = Keypair.generate();
const treasuryAta = Keypair.generate().publicKey;
const recipientAta = Keypair.generate().publicKey;

function connection(genesis: string) {
  return {
    getGenesisHash: vi.fn().mockResolvedValue(genesis),
    getBalance: vi.fn().mockResolvedValue(FAUCET_MIN_TREASURY_LAMPORTS),
  };
}

describe("demo faucet chain boundary", () => {
  it("refuses the wrong cluster before reading a mint or submitting a transaction", async () => {
    const rpc = connection("mainnet-or-testnet");
    const readMint = vi.fn();
    const readTokenAccount = vi.fn();
    const sendTransaction = vi.fn();
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury, readMint, readTokenAccount, sendTransaction,
      deriveTokenAccount: vi.fn().mockResolvedValue(Keypair.generate().publicKey),
    })).rejects.toThrow(/Refusing non-devnet/);
    expect(rpc.getBalance).not.toHaveBeenCalled();
    expect(readMint).not.toHaveBeenCalled();
    expect(readTokenAccount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("checks revoked authorities and finite treasury inventory before submitting one atomic grant", async () => {
    const rpc = connection(SOLANA_DEVNET_GENESIS_HASH);
    const readMint = vi.fn().mockResolvedValue({
      decimals: 6, isInitialized: true, mintAuthority: null, freezeAuthority: null, supply: FAUCET_INVENTORY_E6,
    });
    const readTokenAccount = vi.fn().mockResolvedValue({
      amount: FAUCET_GRANT_E6, isFrozen: false, isInitialized: true, mint, owner: treasury.publicKey,
    });
    const sendTransaction = vi.fn().mockResolvedValue("confirmed-signature");
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury, readMint, readTokenAccount, sendTransaction,
      deriveTokenAccount: vi.fn().mockResolvedValueOnce(treasuryAta).mockResolvedValueOnce(recipientAta),
    })).resolves.toBe("confirmed-signature");
    expect(sendTransaction).toHaveBeenCalledOnce();
    const [, transaction, signers] = sendTransaction.mock.calls[0]!;
    expect(transaction.instructions).toHaveLength(3);
    expect(signers).toEqual([treasury]);
  });

  it("refuses an active mint authority before reading or spending treasury inventory", async () => {
    const rpc = connection(SOLANA_DEVNET_GENESIS_HASH);
    const readTokenAccount = vi.fn();
    const sendTransaction = vi.fn();
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury,
      readMint: vi.fn().mockResolvedValue({ decimals: 6, isInitialized: true, mintAuthority: PublicKey.default, freezeAuthority: null, supply: FAUCET_INVENTORY_E6 }),
      readTokenAccount, sendTransaction,
    })).rejects.toThrow(/not permanently revoked/);
    expect(readTokenAccount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses a revoked mint whose total supply is not the exact fixed inventory", async () => {
    const rpc = connection(SOLANA_DEVNET_GENESIS_HASH);
    const readTokenAccount = vi.fn();
    const sendTransaction = vi.fn();
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury,
      readMint: vi.fn().mockResolvedValue({ decimals: 6, isInitialized: true, mintAuthority: null, freezeAuthority: null, supply: FAUCET_INVENTORY_E6 - 1n }),
      readTokenAccount, sendTransaction,
    })).rejects.toThrow(/exact finite 200-grant supply/);
    expect(readTokenAccount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses to send SOL when the on-chain USDC inventory cannot cover a full grant", async () => {
    const rpc = connection(SOLANA_DEVNET_GENESIS_HASH);
    const sendTransaction = vi.fn();
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury,
      readMint: vi.fn().mockResolvedValue({ decimals: 6, isInitialized: true, mintAuthority: null, freezeAuthority: null, supply: FAUCET_INVENTORY_E6 }),
      readTokenAccount: vi.fn().mockResolvedValue({ amount: FAUCET_GRANT_E6 - 1n, isFrozen: false, isInitialized: true, mint, owner: treasury.publicKey }),
      deriveTokenAccount: vi.fn().mockResolvedValueOnce(treasuryAta).mockResolvedValueOnce(recipientAta),
      sendTransaction,
    })).rejects.toThrow(/inventory has been depleted/);
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
