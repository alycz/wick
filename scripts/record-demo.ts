import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { requiredEnv, sleep } from "./lib/runtime.js";
import { runDemoCheck } from "./demo-check.js";

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";

interface BrowserEvidenceState {
  rpcSignatures: string[];
  streamEvents: DemoStreamEvent[];
}

export interface DemoStreamEvent {
  signature: string;
  eventIndex: number;
  name: string;
  data: Record<string, unknown>;
}

export interface StreamEventCriteria {
  name: string;
  signature?: string;
  market?: string;
  position?: string;
}

export interface ClampEvidence {
  requested: number;
  cap: number;
  actualValue: number;
  visibleText: string;
}

export interface ClampDriver {
  max(): Promise<string | null>;
  request(value: number): Promise<void>;
  value(): Promise<string>;
  visibleText(): Promise<string>;
}

export interface ShotTimeline {
  markets: number;
  weekly: number;
  wallet: number;
  trade: number;
  opened: number;
  liquidated: number;
  settled: number;
  pool: number;
}

async function command(executable: string, args: string[], environment = process.env, capture = false): Promise<string> {
  return new Promise((resolveCommand, reject) => {
    let output = "";
    const child = spawn(executable, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit", env: environment });
    child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolveCommand(output) : reject(new Error(`${executable} exited ${code ?? signal}: ${output}`)));
  });
}

export function srtFromMarkdown(markdown: string): string {
  const match = /```srt\s*\n([\s\S]*?)```/i.exec(markdown);
  if (!match?.[1]?.trim()) throw new Error("docs/DEMO.md must contain a fenced srt caption block");
  return `${match[1].trim()}\n`;
}

function captionText(markdown: string): string[] {
  return srtFromMarkdown(markdown).trim().split(/\n\s*\n/).map((cue) => {
    const lines = cue.split("\n");
    if (lines.length < 3 || !lines[1]?.includes(" --> ")) throw new Error("docs/DEMO.md contains an invalid SRT cue");
    return lines.slice(2).join("\n").trim();
  });
}

function srtTimestamp(seconds: number): string {
  const milliseconds = Math.max(0, Math.round(seconds * 1_000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds % 3_600_000 / 60_000);
  const secs = Math.floor(milliseconds % 60_000 / 1_000);
  const millis = milliseconds % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

export function captionsForObservedTimeline(markdown: string, timeline: ShotTimeline, duration: number): string {
  const text = captionText(markdown);
  const starts = [timeline.markets, timeline.weekly, timeline.wallet, timeline.trade, timeline.opened, timeline.liquidated, timeline.settled, timeline.pool];
  if (text.length !== starts.length) throw new Error(`Expected ${starts.length} demo captions, found ${text.length}`);
  if (!Number.isFinite(duration) || duration < 150 || duration > 180) throw new Error(`Truthful raw recording must be 150–180 seconds; observed ${duration.toFixed(2)} seconds`);
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index]!;
    const end = starts[index + 1] ?? duration;
    if (!Number.isFinite(start) || start < 0 || end <= start || end > duration + 0.25) throw new Error(`Shot ${index + 1} does not align with the raw recording timeline`);
  }
  return starts.map((start, index) => `${index + 1}\n${srtTimestamp(start)} --> ${srtTimestamp(starts[index + 1] ?? duration)}\n${text[index]}`).join("\n\n") + "\n";
}

export function assertLeverageClamp(evidence: ClampEvidence): void {
  if (evidence.requested !== 1_000) throw new Error(`Demo must request exactly 1000x leverage; requested ${evidence.requested}`);
  if (!Number.isFinite(evidence.cap) || evidence.cap < 1 || evidence.cap >= evidence.requested) throw new Error(`Live risk cap ${evidence.cap} does not prove a 1000x clamp`);
  if (evidence.actualValue !== evidence.cap) throw new Error(`1000x clamp failed: slider shows ${evidence.actualValue}x instead of live cap ${evidence.cap}x`);
  const normalized = evidence.visibleText.replace(/\s+/g, " ");
  if (!normalized.includes(`${evidence.cap}×`) || !new RegExp(`${evidence.cap}\\s*[x×].*cap`, "i").test(normalized)) {
    throw new Error(`1000x clamp is not visibly evidenced by the UI: ${normalized}`);
  }
}

function matchesEvent(event: DemoStreamEvent, criteria: StreamEventCriteria): boolean {
  return event.name === criteria.name
    && (criteria.signature === undefined || event.signature === criteria.signature)
    && (criteria.market === undefined || event.data.market === criteria.market)
    && (criteria.position === undefined || event.data.position === criteria.position);
}

export function requireCorrelatedEvent(events: readonly DemoStreamEvent[], criteria: StreamEventCriteria): DemoStreamEvent {
  const match = events.find((event) => matchesEvent(event, criteria));
  if (match) return match;
  const observed = events.filter((event) => event.name === criteria.name).map((event) => ({ signature: event.signature, market: event.data.market, position: event.data.position }));
  throw new Error(`No correlated ${criteria.name} Stream event for ${JSON.stringify(criteria)}; observed ${JSON.stringify(observed)}`);
}

async function installEvidenceCapture(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const scope = window as unknown as { __wickDemoEvidence?: BrowserEvidenceState };
    const evidence: BrowserEvidenceState = { rpcSignatures: [], streamEvents: [] };
    scope.__wickDemoEvidence = evidence;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof window.fetch>): Promise<Response> => {
      const response = await originalFetch(...args);
      try {
        const body = args[1]?.body;
        const requestJson = typeof body === "string" ? JSON.parse(body) as unknown : undefined;
        const responseJson = await response.clone().json() as unknown;
        const requests = Array.isArray(requestJson) ? requestJson : [requestJson];
        const responses = Array.isArray(responseJson) ? responseJson : [responseJson];
        for (const request of requests) {
          if (!request || typeof request !== "object" || !("method" in request) || request.method !== "sendTransaction") continue;
          const id = "id" in request ? request.id : undefined;
          const rpcResponse = responses.find((candidate) => candidate && typeof candidate === "object" && "id" in candidate && candidate.id === id);
          if (rpcResponse && typeof rpcResponse === "object" && "result" in rpcResponse && typeof rpcResponse.result === "string") evidence.rpcSignatures.push(rpcResponse.result);
        }
      } catch { /* Non-RPC fetches are unrelated to transaction evidence. */ }
      return response;
    };
    const OriginalEventSource = window.EventSource;
    window.EventSource = class EvidenceEventSource extends OriginalEventSource {
      constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
        super(url, eventSourceInitDict);
        this.addEventListener("wick", (message) => {
          try {
            const parsed = JSON.parse((message as MessageEvent<string>).data) as DemoStreamEvent;
            if (parsed.signature && parsed.name && parsed.data) evidence.streamEvents.push(parsed);
          } catch { /* The app independently rejects malformed Stream frames. */ }
        });
      }
    };
  });
}

async function evidenceState(page: Page): Promise<BrowserEvidenceState> {
  return page.evaluate(() => {
    const evidence = (window as unknown as { __wickDemoEvidence?: BrowserEvidenceState }).__wickDemoEvidence;
    if (!evidence) throw new Error("Browser evidence capture was not installed");
    return evidence;
  });
}

async function waitForRpcSignature(page: Page, previousCount: number, timeout: number): Promise<string> {
  await page.waitForFunction((count) => {
    const evidence = (window as unknown as { __wickDemoEvidence?: BrowserEvidenceState }).__wickDemoEvidence;
    return Boolean(evidence && evidence.rpcSignatures.length > count);
  }, previousCount, { timeout });
  const evidence = await evidenceState(page);
  const signature = evidence.rpcSignatures[previousCount];
  if (!signature) throw new Error("The browser did not expose the submitted trade signature");
  return signature;
}

async function waitForCorrelatedEvent(page: Page, criteria: StreamEventCriteria, timeout: number): Promise<DemoStreamEvent> {
  await page.waitForFunction((expected) => {
    const events = (window as unknown as { __wickDemoEvidence?: BrowserEvidenceState }).__wickDemoEvidence?.streamEvents ?? [];
    return events.some((event) => event.name === expected.name
      && (expected.signature === undefined || event.signature === expected.signature)
      && (expected.market === undefined || event.data.market === expected.market)
      && (expected.position === undefined || event.data.position === expected.position));
  }, criteria, { timeout });
  return requireCorrelatedEvent((await evidenceState(page)).streamEvents, criteria);
}

async function failOnAlert(page: Page): Promise<void> {
  const alert = page.getByRole("alert").first();
  if (await alert.isVisible().catch(() => false)) throw new Error(`Deployed app reported: ${await alert.textContent()}`);
}

function playwrightClampDriver(slider: Locator): ClampDriver {
  return {
    max: () => slider.getAttribute("max"),
    request: async (value) => slider.evaluate((element, requested) => {
      const input = element as HTMLInputElement;
      input.value = String(requested);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, value),
    value: () => slider.inputValue(),
    visibleText: () => slider.locator("xpath=..").innerText(),
  };
}

export async function proveClamp(driver: ClampDriver, requested: number): Promise<ClampEvidence> {
  const cap = Number(await driver.max());
  if (!Number.isFinite(cap) || cap < 1) throw new Error("Live risk cap is unavailable");
  await driver.request(requested);
  const actualValue = Number(await driver.value());
  const visibleText = await driver.visibleText();
  const evidence = { requested, cap, actualValue, visibleText };
  assertLeverageClamp(evidence);
  return evidence;
}

async function openedTradeFromRpc(connection: Connection, signature: string, programId: PublicKey): Promise<{ market: string; position: string }> {
  const discriminator = createHash("sha256").update("global:open_position").digest().subarray(0, 8);
  const timeoutAt = Date.now() + 60_000;
  do {
    const transaction = await connection.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (transaction) {
      const message = transaction.transaction.message as unknown as {
        accountKeys?: PublicKey[];
        staticAccountKeys?: PublicKey[];
        instructions?: Array<{ programIdIndex: number; accounts: number[]; data: string | Uint8Array }>;
        compiledInstructions?: Array<{ programIdIndex: number; accountKeyIndexes: number[]; data: string | Uint8Array }>;
      };
      const keys = message.accountKeys ?? message.staticAccountKeys ?? [];
      const instructions = message.instructions ?? (message.compiledInstructions ?? []).map((instruction) => ({ ...instruction, accounts: instruction.accountKeyIndexes }));
      const instruction = instructions.find((candidate) => {
        const data = typeof candidate.data === "string" ? bs58.decode(candidate.data) : candidate.data;
        return keys[candidate.programIdIndex]?.equals(programId) && Buffer.from(data).subarray(0, 8).equals(discriminator);
      });
      if (!instruction) throw new Error(`Transaction ${signature} does not contain Wick open_position`);
      const market = keys[instruction.accounts[2] ?? -1];
      const position = keys[instruction.accounts[7] ?? -1];
      if (!market || !position) throw new Error(`Transaction ${signature} does not expose the expected market and position accounts`);
      return { market: market.toBase58(), position: position.toBase58() };
    }
    await sleep(500);
  } while (Date.now() < timeoutAt);
  throw new Error(`Submitted trade ${signature} was not readable from devnet RPC before timeout`);
}

async function showActivityEvidence(page: Page, event: DemoStreamEvent, label: string): Promise<void> {
  const item = page.locator(`a.activity-item[href*="/tx/${event.signature}"]`).filter({ hasText: label });
  await item.waitFor({ state: "visible", timeout: 10_000 });
  await item.scrollIntoViewIfNeeded();
}

export async function recordDemo(): Promise<void> {
  const baseUrl = requiredEnv("DEMO_URL").replace(/\/$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error("DEMO_URL must use HTTPS");
  const rpcUrl = process.env.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) throw new Error(`Refusing non-devnet RPC (genesis ${genesis})`);
  const programId = new PublicKey(requiredEnv("PROGRAM_ID"));

  const seedMinutes = Number(process.env.DEMO_BOT_MINUTES ?? 2);
  await command(process.execPath, ["--import", "tsx", "scripts/bots.ts"], { ...process.env, BOT_MINUTES: String(seedMinutes) });
  await runDemoCheck();

  const rawDirectory = resolve("demo/raw");
  await mkdir(rawDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: rawDirectory, size: { width: 1440, height: 900 } } });
  await installEvidenceCapture(context);
  const page = await context.newPage();
  const startedAt = Date.now();
  const elapsed = (): number => (Date.now() - startedAt) / 1_000;
  const holdUntil = async (seconds: number): Promise<void> => {
    const remaining = seconds - elapsed();
    if (remaining > 0) await page.waitForTimeout(remaining * 1_000);
  };
  const timeline = { markets: 0 } as ShotTimeline;
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await holdUntil(18);
  await page.getByRole("tab", { name: "Weekly" }).click();
  timeline.weekly = elapsed();
  await holdUntil(38);
  await page.getByRole("button", { name: "Try it now" }).click();
  timeline.wallet = elapsed();
  await page.getByRole("button", { name: "Faucet" }).click();
  await page.getByText(/Funded on devnet/).waitFor({ timeout: 60_000 });
  await page.getByRole("link", { name: /Trade live market/ }).click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  await holdUntil(60);
  timeline.trade = elapsed();
  const slider = page.getByLabel("Leverage");
  const clamp = await proveClamp(playwrightClampDriver(slider), 1_000);
  const rpcCount = (await evidenceState(page)).rpcSignatures.length;
  await page.getByRole("button", { name: new RegExp(`Open YES at ${clamp.cap}×`) }).click();
  const tradeSignature = await waitForRpcSignature(page, rpcCount, 60_000);
  await page.getByText(/Confirmed on devnet/).waitFor({ timeout: 60_000 });
  await failOnAlert(page);
  const trade = await openedTradeFromRpc(connection, tradeSignature, programId);
  const opened = await waitForCorrelatedEvent(page, { name: "PositionOpened", signature: tradeSignature, market: trade.market, position: trade.position }, 60_000);
  await showActivityEvidence(page, opened, "Position opened");
  await holdUntil(84);
  timeline.opened = elapsed();
  const liquidated = await waitForCorrelatedEvent(page, { name: "PositionLiquidated", position: trade.position }, 5 * 60_000);
  await showActivityEvidence(page, liquidated, "Liquidation");
  await holdUntil(108);
  timeline.liquidated = elapsed();
  const settled = await waitForCorrelatedEvent(page, { name: "MarketSettled", market: trade.market }, 20 * 60_000);
  await showActivityEvidence(page, settled, "Market settled");
  await holdUntil(132);
  timeline.settled = elapsed();
  await holdUntil(152);
  await page.goto(`${baseUrl}/pool`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Martingaler pool" }).waitFor();
  timeline.pool = elapsed();
  await holdUntil(165);
  const video = page.video();
  await context.close();
  await browser.close();
  const rawPath = await video?.path();
  if (!rawPath) throw new Error("Playwright did not produce a video");
  const stableRaw = resolve("demo/raw/wick-demo-raw.webm");
  await rename(rawPath, stableRaw);

  const durationText = await command("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", stableRaw], process.env, true);
  const duration = Number(durationText.trim());
  const captionMarkdown = await readFile(resolve("docs/DEMO.md"), "utf8");
  const captions = resolve("demo/wick-demo.srt");
  await writeFile(captions, captionsForObservedTimeline(captionMarkdown, timeline, duration));
  const escapedCaptions = captions.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
  const output = resolve("demo/wick-demo.mp4");
  await command("ffmpeg", ["-y", "-i", stableRaw, "-vf", `subtitles='${escapedCaptions}'`, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", output]);
  const outputDurationText = await command("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", output], process.env, true);
  const outputDuration = Number(outputDurationText.trim());
  if (!Number.isFinite(outputDuration) || Math.abs(outputDuration - duration) > 0.5) throw new Error(`Encoded video duration ${outputDuration} does not preserve raw duration ${duration}`);
  console.info(JSON.stringify({ event: "demo_recorded", output: "demo/wick-demo.mp4", durationSeconds: outputDuration, rawDurationSeconds: duration, captions: "docs/DEMO.md", trade: { signature: tradeSignature, ...trade } }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await recordDemo();
