const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;
const STREAM_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;

export const QUICKNODE_EVIDENCE_SCHEMA_VERSION = 1;
export const QUICKNODE_STREAM_EVIDENCE_SCHEMA_VERSION = 1;
export const QUICKNODE_NETWORK = "solana-devnet";
export const QUICKNODE_DATASET = "block";
export const QUICKNODE_STREAM_EXTERNAL_ID = "wick-solana-devnet-program-events-v1";

export interface FilterMatchedTransaction {
  signature: string;
  slot: number;
}

export interface RpcTransactionEvidence {
  signature: string;
  slot: number;
  succeeded: boolean;
  invokedProgramIds: string[];
}

export interface QuickNodeFilterEvidence {
  schemaVersion: 1;
  network: typeof QUICKNODE_NETWORK;
  dataset: typeof QUICKNODE_DATASET;
  programId: string;
  block: string;
  matchedTransaction: FilterMatchedTransaction;
  verifiedAt: string;
  testResult: unknown;
}

export interface QuickNodeActiveStreamEvidence {
  schemaVersion: 1;
  streamId: string;
  externalId: typeof QUICKNODE_STREAM_EXTERNAL_ID;
  status: "active";
  network: typeof QUICKNODE_NETWORK;
  dataset: typeof QUICKNODE_DATASET;
  destinationUrl: string;
  filterSha256: string;
  programId: string;
  verifiedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function field(record: Record<string, unknown>, snakeCase: string, camelCase: string): unknown {
  return record[snakeCase] ?? record[camelCase];
}

function destinationUrl(record: Record<string, unknown>): unknown {
  const attributes = field(record, "destination_attributes", "destinationAttributes");
  return isRecord(attributes) ? attributes.url : undefined;
}

export function verifyActiveStreamConfig(input: {
  providerStream: unknown;
  streamId: string;
  programId: string;
  destinationUrl: string;
  filterFunction: string;
  filterSha256: string;
  now?: () => Date;
}): QuickNodeActiveStreamEvidence {
  if (!isRecord(input.providerStream)) throw new Error("QuickNode get Stream response was not an object");
  const record = input.providerStream;
  const id = record.id;
  if (id !== input.streamId || typeof id !== "string" || !STREAM_ID.test(id)) {
    throw new Error("QuickNode Stream ID did not match the created or reused Stream");
  }
  if (record.status !== "active") throw new Error(`QuickNode Stream ${id} is not active`);
  if (record.network !== QUICKNODE_NETWORK) throw new Error(`QuickNode Stream ${id} is not on ${QUICKNODE_NETWORK}`);
  if (record.dataset !== QUICKNODE_DATASET) throw new Error(`QuickNode Stream ${id} does not use the ${QUICKNODE_DATASET} dataset`);
  if (field(record, "external_id", "externalId") !== QUICKNODE_STREAM_EXTERNAL_ID) {
    throw new Error(`QuickNode Stream ${id} has an unexpected external ID`);
  }
  if (record.destination !== "webhook" || destinationUrl(record) !== input.destinationUrl) {
    throw new Error(`QuickNode Stream ${id} has an unexpected webhook destination`);
  }
  if (field(record, "filter_function", "filterFunction") !== input.filterFunction) {
    throw new Error(`QuickNode Stream ${id} filter does not match the reviewed Wick filter`);
  }
  if (!SHA256.test(input.filterSha256)) throw new Error("Reviewed Wick filter SHA-256 is invalid");
  return {
    schemaVersion: QUICKNODE_STREAM_EVIDENCE_SCHEMA_VERSION,
    streamId: id,
    externalId: QUICKNODE_STREAM_EXTERNAL_ID,
    status: "active",
    network: QUICKNODE_NETWORK,
    dataset: QUICKNODE_DATASET,
    destinationUrl: input.destinationUrl,
    filterSha256: input.filterSha256.toLowerCase(),
    programId: input.programId,
    verifiedAt: (input.now ?? (() => new Date()))().toISOString(),
  };
}

export function validateQuickNodeActiveStreamEvidence(
  value: unknown,
  expected: { streamId?: string; programId?: string; destinationUrl?: string; filterSha256?: string } = {},
): string[] {
  if (!isRecord(value)) return ["saved QuickNode active-Stream evidence is not a JSON object"];
  const blockers: string[] = [];
  const allowed = new Set([
    "schemaVersion", "streamId", "externalId", "status", "network", "dataset",
    "destinationUrl", "filterSha256", "programId", "verifiedAt",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) blockers.push("saved QuickNode active-Stream evidence contains unexpected fields");
  if (value.schemaVersion !== QUICKNODE_STREAM_EVIDENCE_SCHEMA_VERSION) blockers.push("saved QuickNode active-Stream evidence has an unsupported schema version");
  if (typeof value.streamId !== "string" || !STREAM_ID.test(value.streamId)) blockers.push("saved QuickNode active-Stream evidence has no valid Stream ID");
  if (expected.streamId && value.streamId !== expected.streamId) blockers.push("saved QuickNode active-Stream evidence does not match QUICKNODE_STREAM_ID");
  if (value.externalId !== QUICKNODE_STREAM_EXTERNAL_ID) blockers.push("saved QuickNode active-Stream evidence has an unexpected external ID");
  if (value.status !== "active") blockers.push("saved QuickNode active-Stream evidence is not active");
  if (value.network !== QUICKNODE_NETWORK) blockers.push("saved QuickNode active-Stream evidence is not for Solana devnet");
  if (value.dataset !== QUICKNODE_DATASET) blockers.push("saved QuickNode active-Stream evidence is not for the block dataset");
  if (typeof value.destinationUrl !== "string" || !value.destinationUrl) blockers.push("saved QuickNode active-Stream evidence has no destination URL");
  if (expected.destinationUrl && value.destinationUrl !== expected.destinationUrl) blockers.push("saved QuickNode active-Stream evidence destination does not match the backend webhook");
  if (typeof value.filterSha256 !== "string" || !SHA256.test(value.filterSha256)) blockers.push("saved QuickNode active-Stream evidence has no valid filter SHA-256");
  if (expected.filterSha256 && value.filterSha256 !== expected.filterSha256.toLowerCase()) blockers.push("saved QuickNode active-Stream evidence filter does not match the reviewed Wick filter");
  if (typeof value.programId !== "string" || !value.programId) blockers.push("saved QuickNode active-Stream evidence has no program ID");
  if (expected.programId && value.programId !== expected.programId) blockers.push("saved QuickNode active-Stream evidence program ID does not match PROGRAM_ID");
  if (typeof value.verifiedAt !== "string" || !Number.isFinite(Date.parse(value.verifiedAt))) blockers.push("saved QuickNode active-Stream evidence has no valid verification time");
  return blockers;
}

export function extractMatchedTransactions(value: unknown): FilterMatchedTransaction[] {
  const matches: FilterMatchedTransaction[] = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    if (Array.isArray(candidate.matchedTransactions)) {
      for (const transaction of candidate.matchedTransactions) {
        if (!isRecord(transaction)) continue;
        if (typeof transaction.signature !== "string" || !SOLANA_SIGNATURE.test(transaction.signature)) continue;
        if (typeof transaction.slot !== "number" || !Number.isSafeInteger(transaction.slot) || transaction.slot < 0) continue;
        matches.push({ signature: transaction.signature, slot: transaction.slot });
      }
    }
    Object.values(candidate).forEach(visit);
  };
  visit(value);
  return matches;
}

export async function verifyFilterTestResult(
  testResult: unknown,
  input: {
    programId: string;
    block: string;
    loadTransaction: (signature: string) => Promise<RpcTransactionEvidence | null>;
    now?: () => Date;
  },
): Promise<QuickNodeFilterEvidence> {
  const block = Number(input.block);
  if (!Number.isSafeInteger(block) || block < 0 || String(block) !== input.block) {
    throw new Error("QuickNode filter-test block must be a non-negative integer string");
  }
  const matches = extractMatchedTransactions(testResult).filter((match) => match.slot === block);
  if (matches.length === 0) {
    throw new Error(`The QuickNode filter test for block ${input.block} did not return a valid matched transaction at that block`);
  }
  for (const match of matches) {
    const transaction = await input.loadTransaction(match.signature);
    if (!transaction) continue;
    if (transaction.signature !== match.signature || transaction.slot !== block || !transaction.succeeded) continue;
    if (!transaction.invokedProgramIds.includes(input.programId)) continue;
    return {
      schemaVersion: QUICKNODE_EVIDENCE_SCHEMA_VERSION,
      network: QUICKNODE_NETWORK,
      dataset: QUICKNODE_DATASET,
      programId: input.programId,
      block: input.block,
      matchedTransaction: match,
      verifiedAt: (input.now ?? (() => new Date()))().toISOString(),
      testResult,
    };
  }
  throw new Error(`No QuickNode filter-test match could be verified as a successful ${input.programId} transaction in block ${input.block}`);
}

export function validateQuickNodeFilterEvidence(
  value: unknown,
  expected: { programId?: string; block?: string } = {},
): string[] {
  if (!isRecord(value)) return ["saved QuickNode filter-test evidence is not a JSON object"];
  const blockers: string[] = [];
  if (value.schemaVersion !== QUICKNODE_EVIDENCE_SCHEMA_VERSION) blockers.push("saved QuickNode filter-test evidence has an unsupported schema version");
  if (value.network !== QUICKNODE_NETWORK) blockers.push("saved QuickNode filter-test evidence is not for Solana devnet");
  if (value.dataset !== QUICKNODE_DATASET) blockers.push("saved QuickNode filter-test evidence is not for the block dataset");
  if (typeof value.programId !== "string" || !value.programId) blockers.push("saved QuickNode filter-test evidence has no program ID");
  if (expected.programId && value.programId !== expected.programId) blockers.push("saved QuickNode filter-test evidence program ID does not match PROGRAM_ID");
  if (typeof value.block !== "string" || !/^\d+$/.test(value.block)) blockers.push("saved QuickNode filter-test evidence has no valid block");
  if (expected.block && value.block !== expected.block) blockers.push("saved QuickNode filter-test evidence block does not match STREAMS_TEST_BLOCK");
  if (typeof value.verifiedAt !== "string" || !Number.isFinite(Date.parse(value.verifiedAt))) blockers.push("saved QuickNode filter-test evidence has no valid verification time");
  if (!isRecord(value.matchedTransaction)) {
    blockers.push("saved QuickNode filter-test evidence has no verified matched transaction");
  } else {
    const signature = value.matchedTransaction.signature;
    const slot = value.matchedTransaction.slot;
    if (typeof signature !== "string" || !SOLANA_SIGNATURE.test(signature)) blockers.push("saved QuickNode filter-test evidence has no valid transaction signature");
    if (typeof slot !== "number" || !Number.isSafeInteger(slot) || slot < 0 || String(slot) !== value.block) blockers.push("saved QuickNode filter-test evidence transaction slot does not match its block");
    if (!extractMatchedTransactions(value.testResult).some((match) => match.signature === signature && match.slot === slot)) {
      blockers.push("saved QuickNode filter-test response does not contain its verified transaction");
    }
  }
  return blockers;
}
