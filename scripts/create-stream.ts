import { Connection, PublicKey } from "@solana/web3.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QUICKNODE_DATASET,
  QUICKNODE_NETWORK,
  type QuickNodeFilterEvidence,
  type RpcTransactionEvidence,
  verifyFilterTestResult,
} from "./lib/quicknode-evidence.js";

const STREAMS_API = "https://api.quicknode.com/streams/rest/v1";
const EXTERNAL_ID = "wick-solana-devnet-program-events-v1";

export interface StreamEnvironment {
  apiKey: string;
  programId: string;
  backendUrl: string;
  webhookSecret: string;
  rpcUrl: string;
  testBlock?: string;
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env): StreamEnvironment {
  const programId = required(environment, "PROGRAM_ID");
  new PublicKey(programId);
  const backendUrl = (environment.NEXT_PUBLIC_BACKEND_URL ?? environment.BACKEND_URL)?.trim();
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_URL or BACKEND_URL is required");
  const parsedBackend = new URL(backendUrl);
  if (parsedBackend.protocol !== "https:") throw new Error("The Streams webhook backend must use HTTPS");
  return {
    apiKey: required(environment, "QUICKNODE_API_KEY"),
    programId,
    backendUrl: parsedBackend.toString().replace(/\/$/, ""),
    webhookSecret: required(environment, "STREAMS_WEBHOOK_SECRET"),
    rpcUrl: required(environment, "QUICKNODE_RPC_URL"),
    ...(environment.STREAMS_TEST_BLOCK?.trim() ? { testBlock: environment.STREAMS_TEST_BLOCK.trim() } : {}),
  };
}

export function substituteProgramId(source: string, programId: string): string {
  if (!source.includes("__PROGRAM_ID__")) throw new Error("streams/filter.js is missing the program placeholder");
  return source.replaceAll("__PROGRAM_ID__", programId);
}

async function request(apiKey: string, path: string, body?: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${STREAMS_API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({ error: "QuickNode returned a non-JSON response" })) as unknown;
  if (!response.ok) throw new Error(`QuickNode Streams ${path} failed with HTTP ${response.status}`);
  return payload;
}

const STREAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requireStreamIdentity(value: unknown): { id: string; status?: string } {
  if (!value || typeof value !== "object") throw new Error("QuickNode create Stream response was not an object");
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!STREAM_ID.test(id)) throw new Error("QuickNode create Stream response did not contain a valid Stream UUID");
  return { id, ...(typeof record.status === "string" ? { status: record.status } : {}) };
}

export async function waitForActiveStream(
  id: string,
  getStream: () => Promise<unknown>,
  options: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Record<string, unknown>> {
  if (!STREAM_ID.test(id)) throw new Error("Cannot verify an invalid QuickNode Stream ID");
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  const delay = options.sleep ?? ((ms: number) => new Promise<void>((resolveDelay) => setTimeout(resolveDelay, ms)));
  do {
    const value = await getStream();
    if (!value || typeof value !== "object") throw new Error("QuickNode get Stream response was not an object");
    const record = value as Record<string, unknown>;
    if (record.id !== id) throw new Error("QuickNode get Stream response ID did not match the created Stream");
    if (record.status === "active") return record;
    if (record.status === "paused") throw new Error(`QuickNode Stream ${id} is paused, not active`);
    if (Date.now() >= deadline) break;
    await delay(options.pollMs ?? 1_000);
  } while (Date.now() < deadline);
  throw new Error(`QuickNode Stream ${id} did not reach active status before timeout`);
}

async function findRecentProgramBlock(rpcUrl: string, programId: string): Promise<string> {
  const connection = new Connection(rpcUrl, "confirmed");
  const signatures = await connection.getSignaturesForAddress(new PublicKey(programId), { limit: 20 }, "confirmed");
  const successful = signatures.find((item) => item.err === null);
  if (!successful) throw new Error("No successful recent devnet program transaction was found; set STREAMS_TEST_BLOCK after exercising the program");
  return successful.slot.toString();
}

async function loadRpcTransaction(connection: Connection, signature: string): Promise<RpcTransactionEvidence | null> {
  const transaction = await connection.getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction) return null;
  const instructions = [
    ...transaction.transaction.message.instructions,
    ...(transaction.meta?.innerInstructions ?? []).flatMap((group) => group.instructions),
  ];
  return {
    signature: transaction.transaction.signatures[0] ?? "",
    slot: transaction.slot,
    succeeded: transaction.meta?.err === null,
    invokedProgramIds: instructions.map((instruction) => instruction.programId.toBase58()),
  };
}

export async function verifyAndSaveFilterTestResult(input: {
  testResult: unknown;
  programId: string;
  block: string;
  loadTransaction: (signature: string) => Promise<RpcTransactionEvidence | null>;
  writeEvidence: (evidence: QuickNodeFilterEvidence) => Promise<void>;
  now?: () => Date;
}): Promise<QuickNodeFilterEvidence> {
  const evidence = await verifyFilterTestResult(input.testResult, {
    programId: input.programId,
    block: input.block,
    loadTransaction: input.loadTransaction,
    ...(input.now ? { now: input.now } : {}),
  });
  await input.writeEvidence(evidence);
  return evidence;
}

export async function createStream(options: { testOnly?: boolean } = {}): Promise<void> {
  const environment = readEnvironment();
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const filterSource = await readFile(resolve(root, "streams/filter.js"), "utf8");
  const filter = substituteProgramId(filterSource, environment.programId);
  const filterFunction = Buffer.from(filter).toString("base64");
  const block = environment.testBlock ?? await findRecentProgramBlock(environment.rpcUrl, environment.programId);
  const connection = new Connection(environment.rpcUrl, "confirmed");

  const testResult = await request(environment.apiKey, "/streams/test_filter", {
    network: QUICKNODE_NETWORK,
    dataset: QUICKNODE_DATASET,
    filter_function: filterFunction,
    block,
  });
  const fixture = resolve(root, "services/backend/fixtures/quicknode-filter-test.json");
  const evidence = await verifyAndSaveFilterTestResult({
    testResult,
    programId: environment.programId,
    block,
    loadTransaction: (signature) => loadRpcTransaction(connection, signature),
    writeEvidence: async (value) => {
      await mkdir(dirname(fixture), { recursive: true });
      await writeFile(fixture, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    },
  });
  console.log(`QuickNode filter test matched and RPC-verified ${evidence.matchedTransaction.signature} in devnet block ${block}`);
  if (options.testOnly) return;

  const result = await request(environment.apiKey, "/streams", {
    name: "wick-solana-devnet",
    external_id: EXTERNAL_ID,
    network: QUICKNODE_NETWORK,
    dataset: QUICKNODE_DATASET,
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
  const created = requireStreamIdentity(result);
  const active = created.status === "active"
    ? result as Record<string, unknown>
    : await waitForActiveStream(created.id, () => request(environment.apiKey, `/streams/${created.id}`));
  if (active.status !== "active") throw new Error(`QuickNode Stream ${created.id} is not active`);
  console.log(`QuickNode Stream ${created.id} verified active`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await createStream({ testOnly: process.argv.includes("--test-only") });
}
