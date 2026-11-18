"use client";

import dynamic from "next/dynamic";
import type { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair, Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useHealth } from "@/hooks/use-markets";
import { useDemoAccount } from "@/components/demo-account";
import { Seg } from "@/components/markets/controls";
import { usdcE6 } from "@/lib/demo/ledger";
import { compactAddress } from "@/lib/format";
import { usd } from "@/lib/markets";

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
  const { health } = useHealth("account");
  const account = useDemoAccount();
  const fundingAvailable = health?.chainConfigured === true;
  const [open, setOpen] = useState(false);
  const [funding, setFunding] = useState(false);
  const [message, setMessage] = useState<string>();
  const [transfer, setTransfer] = useState<"deposit" | "withdraw">();
  const walletPanelRef = useRef<HTMLDivElement>(null);
  const walletEntryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    walletPanelRef.current?.querySelector<HTMLElement>("[data-wallet-option]")?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!walletPanelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
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
      setMessage(`Funds added · ${result.signature ? compactAddress(result.signature) : "confirmed"}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setFunding(false); }
  };

  const address = wallet.publicKey ?? connected.publicKey?.toBase58();
  /* no wallet yet: the menu runs the demo account so every action still works */
  const demo = !address && account?.active && account.ready ? account : undefined;
  const demoBalance = demo ? Number(demo.ledger.usdcE6) / 1_000_000 : 0;
  const demoFund = async () => {
    if (!demo) return;
    setFunding(true); setMessage(undefined);
    try { await demo.client.deposit(usdcE6(1_000), "faucet"); setMessage("Added $1,000.00 to the local demo balance · no network transfer"); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setFunding(false); }
  };
  const source = wallet.publicKey ? "Local wallet · this browser" : connected.wallet ? `${connected.wallet.adapter.name} · Solana devnet` : "";

  return (
    <div className="chrome-wallet" ref={walletPanelRef} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        walletEntryRef.current?.focus();
      }
    }}>
      {demo && <button className="chrome-wallet-entry chrome-wallet-demo" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="wallet-options"
        aria-label={`Demo account, ${usd(demoBalance)}`} onClick={() => setOpen((value) => !value)}>
        <small>Demo</small><b>{usd(demoBalance)}</b>
      </button>}
      <button className={address ? "chrome-wallet-entry" : "chrome-wallet-entry chrome-wallet-entry--connect"} ref={walletEntryRef} type="button"
        aria-haspopup="dialog" aria-expanded={open} aria-controls="wallet-options"
        onClick={() => setOpen((value) => !value)}>
        {address && <i className="chrome-wallet-dot" aria-hidden="true" />}
        {address ? compactAddress(address) : "Connect wallet"}
        <svg className="chrome-wallet-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="chrome-wallet-popover" id="wallet-options" role="dialog" aria-label="Wallet">
        {demo && <>
          <div className="chrome-wallet-head">
            <span className="chrome-wallet-avatar chrome-wallet-avatar--demo" aria-hidden="true" />
            <div><b>Demo account</b><small>Live prices · {usd(demoBalance)} simulated USDC</small></div>
          </div>
          <div className="chrome-wallet-acts">
            <button data-wallet-option className="chrome-wallet-dep" type="button" onClick={() => { setOpen(false); setTransfer("deposit"); }}>Deposit</button>
            <button className="chrome-wallet-wd" type="button" onClick={() => { setOpen(false); setTransfer("withdraw"); }}>Withdraw</button>
          </div>
          <div className="chrome-wallet-items">
            <button className="chrome-wallet-link" type="button" onClick={() => void demoFund()} disabled={funding}>{funding ? "Adding funds…" : "Add funds"}</button>
            <button className="chrome-wallet-link" type="button" onClick={() => { demo.reset(); setMessage("Demo account reset"); }}>Reset demo</button>
          </div>
          <p className="chrome-wallet-or">Connect a wallet for Solana devnet transactions</p>
        </>}
        {address && <div className="chrome-wallet-head">
          <span className="chrome-wallet-avatar" aria-hidden="true" />
          <div><b>{compactAddress(address)}</b><small>{source}</small></div>
        </div>}
        {!wallet.publicKey && <div className="chrome-wallet-external"><WalletMultiButton data-wallet-option>Connect Phantom or Solflare</WalletMultiButton></div>}
        {!address && <button data-wallet-option className="chrome-wallet-option" type="button" onClick={wallet.create}>
          <strong>Create a local wallet</strong><span>Stored only in this browser</span>
        </button>}
        {address && <div className="chrome-wallet-acts">
          <button data-wallet-option className="chrome-wallet-dep" type="button" onClick={() => { setOpen(false); setTransfer("deposit"); }}>Deposit</button>
          <button className="chrome-wallet-wd" type="button" onClick={() => { setOpen(false); setTransfer("withdraw"); }}>Withdraw</button>
        </div>}
        {address && <div className="chrome-wallet-items">
          {fundingAvailable && <button data-wallet-option className="chrome-wallet-link" type="button" onClick={() => void fund()} disabled={funding}>{funding ? "Adding funds…" : "Add funds"}</button>}
          {wallet.publicKey && <button data-wallet-option className="chrome-wallet-link" type="button" onClick={wallet.exportKey}>Export key</button>}
        </div>}
        {wallet.publicKey && <button data-wallet-option className="chrome-wallet-link chrome-wallet-link--danger" type="button" onClick={wallet.reset}>Remove local wallet</button>}
      </div>}
      {message && <p className="chrome-wallet-message" aria-live="polite">{message}</p>}
      {transfer && demo && <TransferDialog mode={transfer} onMode={setTransfer} onClose={() => { setTransfer(undefined); walletEntryRef.current?.focus(); }}
        address={demo.ledger.owner} source="Demo account" funding={funding}
        demo={{ balance: demoBalance, deposit: (amount) => demo.client.deposit(usdcE6(amount)), withdraw: (amount, to) => demo.client.withdraw(usdcE6(amount), to) }} />}
      {transfer && address && <TransferDialog mode={transfer} onMode={setTransfer} onClose={() => { setTransfer(undefined); walletEntryRef.current?.focus(); }}
        address={address} source={source} funding={funding} {...(fundingAvailable ? { onFund: () => void fund() } : {})} />}
    </div>
  );
}

/* Deposit and withdraw. Positions draw margin straight from the wallet's USDC, so a deposit is USDC sent to this address.
   Withdrawals have no backend support yet, so that side is a placeholder. */
interface DemoTransfer { balance: number; deposit: (amount: number) => Promise<string>; withdraw: (amount: number, to: string) => Promise<string> }

function TransferDialog({ mode, onMode, onClose, address, source, funding, onFund, demo }: {
  mode: "deposit" | "withdraw"; onMode: (mode: "deposit" | "withdraw") => void; onClose: () => void;
  address: string; source: string; funding: boolean; onFund?: () => void; demo?: DemoTransfer;
}) {
  const [copied, setCopied] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLElement>("button")?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  };
  return <div className="dw-scrim" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dw" role="dialog" aria-modal="true" aria-label={mode === "deposit" ? "Deposit" : "Withdraw"} ref={dialog}>
      <div className="dw-hd">
        <Seg className="wc-tabs" buttonClass="wc-tab" label="Action" value={mode} onChange={onMode}
          options={[{ value: "deposit", label: "Deposit" }, { value: "withdraw", label: "Withdraw" }]} />
        <button type="button" className="dw-x" aria-label="Close" onClick={onClose}>×</button>
      </div>
      {demo ? <DemoTransferBody mode={mode} demo={demo} /> : mode === "deposit" ? <>
        <div className="dw-src"><span className="dw-ico" aria-hidden="true" /><div><small>Your wallet</small><b>{compactAddress(address)}</b></div><div className="r"><small>Network</small><b>Solana devnet</b></div></div>
        <p className="dw-txt">Send test USDC on Solana devnet to this address. Wick takes margin straight from this wallet when you open a position, so there&apos;s nothing else to move.</p>
        <div className="dw-addr"><code>{address}</code><button type="button" className="dw-copy" onClick={() => void copy()}>{copied ? "Copied" : "Copy"}</button></div>
        {onFund && <button type="button" className="dw-go" disabled={funding} onClick={onFund}>{funding ? "Adding funds…" : "Add funds"}</button>}
        <small className="dw-foot">{source}</small>
      </> : <>
        <div className="dw-fld"><label htmlFor="dw-amt">Amount</label><input id="dw-amt" inputMode="decimal" placeholder="0.00 USDC" disabled /></div>
        <div className="dw-fld"><label htmlFor="dw-to">Send to</label><input id="dw-to" placeholder="Solana address" disabled /></div>
        <p className="dw-txt">Withdrawals aren&apos;t available yet. This will open once the backend supports them.</p>
        <button type="button" className="dw-go" disabled>Withdraw</button>
      </>}
    </div>
  </div>;
}

/* The demo account's side of the dialog: amounts move the demo balance, with the same checks a real transfer would hit. */
function DemoTransferBody({ mode, demo }: { mode: "deposit" | "withdraw"; demo: DemoTransfer }) {
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string }>();
  useEffect(() => { setAmount(""); setResult(undefined); }, [mode]);
  const value = Number(amount) || 0;
  const submit = async () => {
    setBusy(true); setResult(undefined);
    try {
      const receiptId = mode === "deposit" ? await demo.deposit(value) : await demo.withdraw(value, to);
      setResult({ ok: true, text: `Local demo balance ${mode === "deposit" ? "increased" : "decreased"} ${usd(value)} · ${receiptId} · no network transfer` });
      setAmount("");
    } catch (error) { setResult({ ok: false, text: error instanceof Error ? error.message : String(error) }); }
    finally { setBusy(false); }
  };
  const chips = mode === "deposit" ? [100, 500, 1_000] : [25, 50, 100];
  return <>
    <div className="dw-src"><span className="dw-ico" aria-hidden="true" /><div><small>Demo balance</small><b>{usd(demo.balance)}</b></div><div className="r"><small>Network</small><b>Local browser</b></div></div>
    <div className="dw-fld"><label htmlFor="dw-amt">Amount</label>
      <input id="dw-amt" inputMode="decimal" placeholder="0.00 USDC" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} /></div>
    <div className="dw-chips">{chips.map((option) => {
      const next = mode === "deposit" ? option : Math.floor(demo.balance * option) / 100;
      const label = mode === "deposit" ? `$${option.toLocaleString("en-US")}` : option === 100 ? "All" : `${option}%`;
      return <button type="button" key={option} onClick={() => setAmount(String(next))}>{label}</button>;
    })}</div>
    {mode === "withdraw" && <div className="dw-fld"><label htmlFor="dw-to">Send to</label>
      <input id="dw-to" placeholder="Solana address" value={to} onChange={(event) => setTo(event.target.value)} spellCheck={false} /></div>}
    <button type="button" className="dw-go" disabled={busy || value <= 0 || (mode === "withdraw" && !to.trim())} onClick={() => void submit()}>
      {busy ? "Confirming…" : mode === "deposit" ? "Deposit" : "Withdraw"}
    </button>
    {result && <p className={`dw-res ${result.ok ? "up" : "down"}`} role={result.ok ? "status" : "alert"}>{result.text}</p>}
    <small className="dw-foot">Practice account only · simulated USDC · no network transfer</small>
  </>;
}
