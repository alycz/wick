"use client";

import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { PUBLIC_DEVNET_RPC } from "@wick/shared";
import { useMemo, type ReactNode } from "react";
import { SkulletProvider } from "skullet/react";
import { DemoWalletProvider } from "./wallet-panel";

/* skeleton loading (skullet.lochie.me), tuned to the dark palette */
const SKELETON_THEME = {
  dark: { base: "rgb(255 255 255 / 0.06)", highlight: "rgb(255 255 255 / 0.11)" },
  light: { base: "rgb(255 255 255 / 0.06)", highlight: "rgb(255 255 255 / 0.11)" },
  animation: "shimmer" as const,
  speed: "slow" as const,
  radius: "6px",
  text: { top: "cap-height" as const, bottom: "baseline" as const },
};

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? PUBLIC_DEVNET_RPC;
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <DemoWalletProvider><SkulletProvider mode="dark" theme={SKELETON_THEME}>{children}</SkulletProvider></DemoWalletProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
