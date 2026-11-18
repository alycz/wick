"use client";

import type { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";
import { useDemoAccount } from "@/components/demo-account";
import { useDemoWallet } from "@/components/wallet-panel";
import { chainConfigurationError, createWickClient } from "@/lib/chain";
import type { WickClient } from "@/lib/demo/client";

export interface WickActionsState {
  client?: WickClient;
  error?: string;
  owner?: string;
  /* true when actions go to the browser demo account instead of DevNet */
  demo?: boolean;
}

export function useWickActions(): WickActionsState {
  const demo = useDemoWallet();
  const connected = useWallet();
  const account = useDemoAccount();
  const demoActive = account?.active === true && account.ready;
  const demoClient = account?.client;
  const demoOwner = account?.ledger.owner;
  return useMemo(() => {
    if (demoActive && demoClient && demoOwner) return { client: demoClient, owner: demoOwner, demo: true };
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
  }, [demoActive, demoClient, demoOwner, demo.anchorWallet, connected.publicKey, connected.signTransaction, connected.signAllTransactions]);
}
