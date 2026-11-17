const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;

export const QUICKNODE_EVIDENCE_SCHEMA_VERSION = 1;
export const QUICKNODE_NETWORK = "solana-devnet";
export const QUICKNODE_DATASET = "block";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
