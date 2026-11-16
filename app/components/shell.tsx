import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@wick/shared";
import { ActivityRail } from "./activity-rail";
import { WalletPanel } from "./wallet-panel";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <header className="topbar">
        <Link className="wordmark" href="/" aria-label="Wick markets home"><span>W</span>{BRAND.name}</Link>
        <nav aria-label="Primary navigation">
          <Link href="/">Markets</Link><Link href="/portfolio">Portfolio</Link><Link href="/pool">Pool</Link>
        </nav>
        <WalletPanel />
      </header>
      <div className="app-grid"><main>{children}</main><ActivityRail /></div>
      <footer>Devnet demo. Test USDC only. Not a real-money product.</footer>
    </div>
  );
}
