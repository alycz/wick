// @vitest-environment node
import { Keypair, PublicKey } from "@solana/web3.js";
import { SOLANA_DEVNET_GENESIS_HASH } from "@wick/shared";
import { describe, expect, it, vi } from "vitest";
import { FAUCET_MIN_TREASURY_LAMPORTS, sendFaucetGrant } from "@/lib/faucet";

const mint = Keypair.generate().publicKey;
const recipient = Keypair.generate().publicKey;
const treasury = Keypair.generate();
const authority = Keypair.generate();

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
    const sendTransaction = vi.fn();
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury, authority, readMint, sendTransaction,
      deriveTokenAccount: vi.fn().mockResolvedValue(Keypair.generate().publicKey),
    })).rejects.toThrow(/Refusing non-devnet/);
    expect(rpc.getBalance).not.toHaveBeenCalled();
    expect(readMint).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("checks treasury and mint controls before submitting one atomic grant", async () => {
    const rpc = connection(SOLANA_DEVNET_GENESIS_HASH);
    const readMint = vi.fn().mockResolvedValue({
      decimals: 6, isInitialized: true, mintAuthority: authority.publicKey, supply: 0n,
    });
    const sendTransaction = vi.fn().mockResolvedValue("confirmed-signature");
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury, authority, readMint, sendTransaction,
      deriveTokenAccount: vi.fn().mockResolvedValue(Keypair.generate().publicKey),
    })).resolves.toBe("confirmed-signature");
    expect(sendTransaction).toHaveBeenCalledOnce();
    const [, transaction, signers] = sendTransaction.mock.calls[0]!;
    expect(transaction.instructions).toHaveLength(3);
    expect(signers).toHaveLength(2);
  });

  it("refuses a mint not controlled by the configured authority", async () => {
    const rpc = connection(SOLANA_DEVNET_GENESIS_HASH);
    const sendTransaction = vi.fn();
    await expect(sendFaucetGrant({
      connection: rpc as never, mint, recipient, treasury, authority,
      readMint: vi.fn().mockResolvedValue({ decimals: 6, isInitialized: true, mintAuthority: PublicKey.default, supply: 0n }),
      sendTransaction,
    })).rejects.toThrow(/does not control/);
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
