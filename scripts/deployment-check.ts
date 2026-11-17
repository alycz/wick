import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WICK_IDL } from "../packages/shared/src/idl.js";
import { evaluateDeploymentReadiness } from "./lib/deployment-check.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const commandNames = ["anchor", "solana", "rustc", "pnpm", "spl-token", "railway", "vercel", "docker"];
const fileNames = [
  "target/deploy/wick-keypair.json",
  "target/deploy/wick.so",
  "services/backend/Dockerfile",
  "services/backend/railway.json",
  "services/backend/fixtures/quicknode-filter-test.json",
  "services/backend/fixtures/quicknode-stream-active.json",
  "vercel.json",
];

async function existingFiles(): Promise<Set<string>> {
  const result = new Set<string>();
  await Promise.all(fileNames.map(async (path) => {
    try { await access(resolve(root, path)); result.add(path); } catch { /* absent */ }
  }));
  return result;
}

function commandEvidence(): { commands: Set<string>; versions: Map<string, string> } {
  const commands = new Set<string>();
  const versions = new Map<string, string>();
  for (const command of commandNames) {
    const result = spawnSync(command, ["--version"], { encoding: "utf8" });
    if (result.status !== 0) continue;
    commands.add(command);
    versions.set(command, `${result.stdout ?? ""}${result.stderr ?? ""}`.trim());
  }
  return { commands, versions };
}

async function quicknodeFilterEvidence(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(root, "services/backend/fixtures/quicknode-filter-test.json"), "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function quicknodeActiveStreamEvidence(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(resolve(root, "services/backend/fixtures/quicknode-stream-active.json"), "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function expectedStreamFilterSha256(): Promise<string | undefined> {
  const programId = process.env.PROGRAM_ID?.trim();
  if (!programId) return undefined;
  try {
    const source = await readFile(resolve(root, "streams/filter.js"), "utf8");
    if (!source.includes("__PROGRAM_ID__")) return undefined;
    const filterFunction = Buffer.from(source.replaceAll("__PROGRAM_ID__", programId)).toString("base64");
    return createHash("sha256").update(filterFunction).digest("hex");
  } catch {
    return undefined;
  }
}

async function backendAdapterConfigured(): Promise<boolean> {
  const main = await readFile(resolve(root, "services/backend/src/main.ts"), "utf8");
  return !main.includes("new UnconfiguredChainPort()");
}

const commandState = commandEvidence();
const streamFilterSha256 = await expectedStreamFilterSha256();
const readiness = evaluateDeploymentReadiness({
  commands: commandState.commands,
  commandVersions: commandState.versions,
  files: await existingFiles(),
  environment: process.env,
  idlInstructionCount: WICK_IDL.instructions.length,
  backendChainAdapterConfigured: await backendAdapterConfigured(),
  quicknodeFilterEvidence: await quicknodeFilterEvidence(),
  quicknodeActiveStreamEvidence: await quicknodeActiveStreamEvidence(),
  ...(streamFilterSha256 ? { expectedStreamFilterSha256: streamFilterSha256 } : {}),
});

console.info(JSON.stringify(readiness, null, 2));
if (process.argv.includes("--require-ready") && !readiness.allReady) process.exitCode = 1;
