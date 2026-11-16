import { chromium, type Page } from "playwright";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { requiredEnv } from "./lib/runtime.js";
import { runDemoCheck } from "./demo-check.js";

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

async function failOnAlert(page: Page): Promise<void> {
  const alert = page.getByRole("alert").first();
  if (await alert.isVisible().catch(() => false)) throw new Error(`Deployed app reported: ${await alert.textContent()}`);
}

async function waitForNewText(page: Page, text: string, previousCount: number, timeout: number): Promise<void> {
  await page.waitForFunction(({ expected, count }) => Array.from(document.querySelectorAll(".activity-item span")).filter((node) => node.textContent?.trim() === expected).length > count, { expected: text, count: previousCount }, { timeout });
}

export async function recordDemo(): Promise<void> {
  const baseUrl = requiredEnv("DEMO_URL").replace(/\/$/, "");
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error("DEMO_URL must use HTTPS");

  const seedMinutes = Number(process.env.DEMO_BOT_MINUTES ?? 2);
  await command(process.execPath, ["--import", "tsx", "scripts/bots.ts"], { ...process.env, BOT_MINUTES: String(seedMinutes) });
  await runDemoCheck();

  const rawDirectory = resolve("demo/raw");
  await mkdir(rawDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: rawDirectory, size: { width: 1440, height: 900 } } });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Weekly" }).click();
  await page.getByRole("button", { name: "Try it now" }).click();
  await page.getByRole("button", { name: "Faucet" }).click();
  await page.getByText(/Funded on devnet/).waitFor({ timeout: 60_000 });
  await page.getByRole("link", { name: /Trade live market/ }).click();
  await page.getByRole("heading", { level: 1 }).waitFor();
  const slider = page.getByLabel("Leverage");
  const cap = Number(await slider.getAttribute("max"));
  if (!Number.isFinite(cap) || cap < 1) throw new Error("Live risk cap is unavailable");
  await slider.evaluate((element, value) => {
    const input = element as HTMLInputElement; input.value = String(value); input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
  }, 1_000);
  await page.getByText(new RegExp(`1000x.*${cap}x cap|${cap}x.*cap`, "i")).waitFor({ timeout: 5_000 }).catch(() => undefined);
  const openedCount = await page.getByText("Position opened", { exact: true }).count();
  await page.getByRole("button", { name: new RegExp(`Open YES at ${cap}×`) }).click();
  await Promise.race([
    waitForNewText(page, "Position opened", openedCount, 60_000),
    page.getByRole("alert").waitFor({ timeout: 60_000 }).then(async () => { throw new Error(`Deployed app reported: ${await page.getByRole("alert").first().textContent()}`); }),
  ]);
  await failOnAlert(page);
  const liquidationCount = await page.getByText("Liquidation", { exact: true }).count();
  await waitForNewText(page, "Liquidation", liquidationCount, 5 * 60_000);
  const settledCount = await page.getByText("Market settled", { exact: true }).count();
  await waitForNewText(page, "Market settled", settledCount, 20 * 60_000);
  await page.goto(`${baseUrl}/pool`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Martingaler pool" }).waitFor();
  const video = page.video();
  await context.close();
  await browser.close();
  const rawPath = await video?.path();
  if (!rawPath) throw new Error("Playwright did not produce a video");
  const stableRaw = resolve("demo/raw/wick-demo-raw.webm");
  await rename(rawPath, stableRaw);

  const captionMarkdown = await readFile(resolve("docs/DEMO.md"), "utf8");
  const captions = resolve("demo/wick-demo.srt");
  await writeFile(captions, srtFromMarkdown(captionMarkdown));
  const durationText = await command("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", stableRaw], process.env, true);
  const duration = Number(durationText.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("ffprobe could not determine video duration");
  const target = 165;
  const escapedCaptions = captions.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'");
  await command("ffmpeg", ["-y", "-i", stableRaw, "-vf", `setpts=${target / duration}*PTS,subtitles='${escapedCaptions}'`, "-an", "-t", String(target), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", resolve("demo/wick-demo.mp4")]);
  console.info(JSON.stringify({ event: "demo_recorded", output: "demo/wick-demo.mp4", durationSeconds: target, captions: "docs/DEMO.md" }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await recordDemo();
