"use client";

import dynamic from "next/dynamic";
import type { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { compactAddress } from "@/lib/format";

const WalletMultiButton = dynamic(
  async () => (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false },
);

const KEY = "wick-demo-wallet-v1";
const BROWSER_KEY = "wick-browser-id-v1";

interface DemoWalletContextValue {
  publicKey?: string;
  anchorWallet?: Wallet;
  create: () => void;
  reset: () => void;
  exportKey: () => void;
}

const DemoWalletContext = createContext<DemoWalletContextValue | undefined>(undefined);

function decodeStored(value: string): Keypair | undefined {
  try { return Keypair.fromSecretKey(bs58.decode(value)); } catch { return undefined; }
}

export function DemoWalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Keypair>();
  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored) setWallet(decodeStored(stored));
  }, []);
  const create = useCallback(() => {
    const next = Keypair.generate();
    window.localStorage.setItem(KEY, bs58.encode(next.secretKey));
    setWallet(next);
  }, []);
  const reset = useCallback(() => { window.localStorage.removeItem(KEY); setWallet(undefined); }, []);
  const exportKey = useCallback(() => {
    if (!wallet) return;
    const file = new Blob([`${JSON.stringify([...wallet.secretKey])}\n`], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "wick-demo-wallet.json"; anchor.click(); URL.revokeObjectURL(url);
  }, [wallet]);
  const anchorWallet = useMemo<Wallet | undefined>(() => wallet ? {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
      if (transaction instanceof VersionedTransaction) transaction.sign([wallet]);
      else transaction.partialSign(wallet);
      return transaction;
    },
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => Promise.all(transactions.map(async (transaction) => {
      if (transaction instanceof VersionedTransaction) transaction.sign([wallet]);
      else transaction.partialSign(wallet);
      return transaction;
    })),
  } : undefined, [wallet]);
  const value = useMemo<DemoWalletContextValue>(() => ({
    ...(wallet && anchorWallet ? { publicKey: wallet.publicKey.toBase58(), anchorWallet } : {}), create, reset, exportKey,
  }), [wallet, anchorWallet, create, reset, exportKey]);
  return <DemoWalletContext.Provider value={value}>{children}</DemoWalletContext.Provider>;
}

export function useDemoWallet(): DemoWalletContextValue {
  const context = useContext(DemoWalletContext);
  if (!context) throw new Error("DemoWalletProvider is missing");
  return context;
}

function browserId(): string {
  const existing = window.localStorage.getItem(BROWSER_KEY);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.localStorage.setItem(BROWSER_KEY, value);
  return value;
}

export function WalletPanel() {
  const wallet = useDemoWallet();
  const connected = useWallet();
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState<string>();
  const fund = async () => {
    const recipient = wallet.publicKey ?? connected.publicKey?.toBase58();
    if (!recipient) return;
    setFunding(true); setMessage(undefined);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicKey: recipient, browserId: browserId() }),
      });
      const result = await response.json() as { message?: string; signature?: string };
      if (!response.ok) throw new Error(result.message ?? `Faucet failed (${response.status})`);
      setMessage(`Funded on devnet · ${result.signature ? compactAddress(result.signature) : "confirmed"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setFunding(false); }
  };

  return (
    <div className="wallet-cluster">
      {wallet.publicKey ? (
        <div className="demo-wallet" role="status">
          <span><i /> Demo wallet, devnet only</span>
          <strong>{compactAddress(wallet.publicKey)}</strong>
          <button className="text-button" type="button" onClick={() => void fund()} disabled={funding}>{funding ? "Funding…" : "Faucet"}</button>
          <button className="text-button" type="button" onClick={wallet.exportKey}>Export</button>
          <button className="text-button danger" type="button" onClick={wallet.reset}>Reset</button>
        </div>
      ) : (
        <><button className="primary-button" type="button" onClick={wallet.create}>Try it now</button>
        {connected.publicKey && <button className="text-button" type="button" onClick={() => void fund()} disabled={funding}>{funding ? "Funding…" : "Faucet"}</button>}</>
      )}
      <WalletMultiButton />
      {message && <p className="wallet-message" aria-live="polite">{message}</p>}
    </div>
  );
}
