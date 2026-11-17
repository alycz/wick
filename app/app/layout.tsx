import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import "../styles/chrome.css";
import "../styles/landing.css";
import "../styles/markets.css";
import "../styles/trade.css";
import "../styles/account.css";
import { BRAND } from "@wick/shared";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { FeedProvider } from "@/hooks/use-feed";

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.marketingLine,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers><FeedProvider><Shell>{children}</Shell></FeedProvider></Providers></body></html>;
}
