import { Connection, PublicKey } from "@solana/web3.js";
import { PUBLIC_DEVNET_RPC } from "../packages/shared/src/constants.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STREAMS_API = "https://api.quicknode.com/streams/rest/v1";
const NETWORK = "solana-devnet";
const DATASET = "block";
const EXTERNAL_ID = "wick-solana-devnet-program-events-v1";

export interface StreamEnvironment {
  apiKey: string;
  programId: string;
  backendUrl: string;
  webhookSecret: string;
  rpcUrl: string;
  testBlock?: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function readEnvironment(): StreamEnvironment {
  const programId = required("PROGRAM_ID");
  new PublicKey(programId);
  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL)?.trim();
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_URL or BACKEND_URL is required");
  const parsedBackend = new URL(backendUrl);
  if (parsedBackend.protocol !== "https:") throw new Error("The Streams webhook backend must use HTTPS");
  return {
    apiKey: required("QUICKNODE_API_KEY"),
    programId,
    backendUrl: parsedBackend.toString().replace(/\/$/, ""),
    webhookSecret: required("STREAMS_WEBHOOK_SECRET"),
    rpcUrl: process.env.PUBLIC_SOLANA_RPC_URL?.trim() || PUBLIC_DEVNET_RPC,
    ...(process.env.STREAMS_TEST_BLOCK?.trim() ? { testBlock: process.env.STREAMS_TEST_BLOCK.trim() } : {}),
  };
}

export function substituteProgramId(source: string, programId: string): string {
  if (!source.includes("__PROGRAM_ID__")) throw new Error("streams/filter.js is missing the program placeholder");
  return source.replaceAll("__PROGRAM_ID__", programId);
}

async function request(apiKey: string, path: string, body: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${STREAMS_API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({ error: "QuickNode returned a non-JSON response" })) as unknown;
  if (!response.ok) throw new Error(`QuickNode Streams ${path} failed with HTTP ${response.status}`);
  return payload;
}

async function findRecentProgramBlock(rpcUrl: string, programId: string): Promise<string> {
  const connection = new Connection(rpcUrl, "confirmed");
  const signatures = await connection.getSignaturesForAddress(new PublicKey(programId), { limit: 20 }, "confirmed");
  const successful = signatures.find((item) => item.err === null);
  if (!successful) throw new Error("No successful recent devnet program transaction was found; set STREAMS_TEST_BLOCK after exercising the program");
  return successful.slot.toString();
}

function containsMatchedTransaction(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsMatchedTransaction);
  if (!value || typeof value !== "object") return false;
  const object = value as Record<string, unknown>;
  if (Array.isArray(object.matchedTransactions) && object.matchedTransactions.length > 0) return true;
  return Object.values(object).some(containsMatchedTransaction);
}

export async function createStream(options: { testOnly?: boolean } = {}): Promise<void> {
  const environment = readEnvironment();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const filterSource = await readFile(resolve(root, "streams/filter.js"), "utf8");
  const filter = substituteProgramId(filterSource, environment.programId);
  const filterFunction = Buffer.from(filter).toString("base64");
  const block = environment.testBlock ?? await findRecentProgramBlock(environment.rpcUrl, environment.programId);

  const testResult = await request(environment.apiKey, "/streams/test_filter", {
    network: NETWORK,
    dataset: DATASET,
    filter_function: filterFunction,
    block,
  });
  const fixture = resolve(root, "services/backend/fixtures/quicknode-filter-test.json");
  await mkdir(dirname(fixture), { recursive: true });
  await writeFile(fixture, `${JSON.stringify(testResult, null, 2)}\n`, "utf8");
  if (!containsMatchedTransaction(testResult)) {
    throw new Error(`The QuickNode filter test for block ${block} did not return a Wick transaction; the real response was saved for inspection`);
  }
  console.log(`QuickNode filter test matched a Wick transaction in devnet block ${block}`);
  if (options.testOnly) return;

  const result = await request(environment.apiKey, "/streams", {
    name: "wick-solana-devnet",
    external_id: EXTERNAL_ID,
    network: NETWORK,
    dataset: DATASET,
    region: "usa_east",
    dataset_batch_size: 5,
    elastic_batch_enabled: true,
    destination: "webhook",
    destination_attributes: {
      url: `${environment.backendUrl}/streams/webhook`,
      compression: "none",
      headers: { "Content-Type": "application/json", "x-wick-stream-secret": environment.webhookSecret },
      max_retry: 5,
      retry_interval_sec: 1,
      post_timeout_sec: 10,
      mtls: false,
    },
    status: "active",
    filter_function: filterFunction,
    fix_block_reorgs: 1,
    keep_distance_from_tip: 0,
  });
  const id = result && typeof result === "object" && "id" in result ? String((result as { id: unknown }).id) : "created";
  console.log(`QuickNode Stream ${id} is active`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await createStream({ testOnly: process.argv.includes("--test-only") });
}
