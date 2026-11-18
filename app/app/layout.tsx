import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import "../styles/chrome.css";
import "../styles/landing.css";
import "../styles/markets.css";
import "../styles/wick-chart.css";
import "skullet/styles.css";
import { BRAND } from "@wick/shared";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { FeedProvider } from "@/hooks/use-feed";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.marketingLine,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={inter.variable}><Providers><FeedProvider><Shell>{children}</Shell></FeedProvider></Providers></body></html>;
}
