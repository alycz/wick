"use client";

import type { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";
import { useDemoWallet } from "@/components/wallet-panel";
import { chainConfigurationError, createWickClient, type WickBrowserClient } from "@/lib/chain";

export interface WickActionsState {
  client?: WickBrowserClient;
  error?: string;
  owner?: string;
}

export function useWickActions(): WickActionsState {
  const demo = useDemoWallet();
  const connected = useWallet();
  return useMemo(() => {
    const configured = chainConfigurationError();
    if (configured) return { error: configured };
    const externalWallet: Wallet | undefined = connected.publicKey && connected.signTransaction ? {
      publicKey: connected.publicKey,
      signTransaction: connected.signTransaction as Wallet["signTransaction"],
      signAllTransactions: connected.signAllTransactions
        ? connected.signAllTransactions as Wallet["signAllTransactions"]
        : async <T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> => Promise.all(transactions.map((transaction) => connected.signTransaction!(transaction) as Promise<T>)),
    } : undefined;
    const wallet = demo.anchorWallet ?? externalWallet;
    if (!wallet) return { error: "Create a test wallet or connect Phantom / Solflare first." };
    try {
      return { client: createWickClient(wallet), owner: wallet.publicKey.toBase58() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [demo.anchorWallet, connected.publicKey, connected.signTransaction, connected.signAllTransactions]);
}
