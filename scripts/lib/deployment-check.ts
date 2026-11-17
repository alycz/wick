import { validateQuickNodeActiveStreamEvidence, validateQuickNodeFilterEvidence } from "./quicknode-evidence.js";

export interface DeploymentInputs {
  commands: ReadonlySet<string>;
  commandVersions: ReadonlyMap<string, string>;
  files: ReadonlySet<string>;
  environment: NodeJS.ProcessEnv;
  idlInstructionCount: number;
  backendChainAdapterConfigured: boolean;
  quicknodeFilterEvidence: unknown;
  quicknodeActiveStreamEvidence: unknown;
  expectedStreamFilterSha256?: string;
}

export interface DeploymentTargetCheck {
  ready: boolean;
  blockers: string[];
}

export interface DeploymentReadiness {
  program: DeploymentTargetCheck;
  backend: DeploymentTargetCheck;
  frontend: DeploymentTargetCheck;
  quicknodeStream: DeploymentTargetCheck;
  allReady: boolean;
}

function present(environment: NodeJS.ProcessEnv, ...names: string[]): boolean {
  return names.some((name) => Boolean(environment[name]?.trim()));
}

function exactly(environment: NodeJS.ProcessEnv, name: string, value: string): boolean {
  return environment[name]?.trim() === value;
}

function versionBlocker(input: DeploymentInputs, command: string, expected: string, label: string): string | false {
  if (!input.commands.has(command)) return `${label} ${expected} is unavailable`;
  const output = input.commandVersions.get(command) ?? "";
  const escaped = expected.replaceAll(".", "\\.");
  return new RegExp(`(?:^|\\s|v)${escaped}(?:$|\\s|\\))`).test(output)
    ? false
    : `${label} must be ${expected}; installed version output did not match`;
}

function publicHttps(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1";
  } catch {
    return false;
  }
}

function target(blockers: Array<string | false>): DeploymentTargetCheck {
  const filtered = blockers.filter((value): value is string => typeof value === "string");
  return { ready: filtered.length === 0, blockers: filtered };
}

export function evaluateDeploymentReadiness(input: DeploymentInputs): DeploymentReadiness {
  const hasProgramId = present(input.environment, "PROGRAM_ID");
  const hasFrontendProgramId = present(input.environment, "NEXT_PUBLIC_PROGRAM_ID", "PROGRAM_ID");
  const hasMint = present(input.environment, "USDC_TEST_MINT");
  const hasFrontendMint = present(input.environment, "NEXT_PUBLIC_USDC_TEST_MINT", "USDC_TEST_MINT");
  const hasBackendUrl = present(input.environment, "NEXT_PUBLIC_BACKEND_URL", "BACKEND_URL");
  const hasRailwayCliAccess = input.commands.has("railway") && present(input.environment, "RAILWAY_TOKEN", "RAILWAY_API_TOKEN");
  const hasRailwayMcpAccess = exactly(input.environment, "RAILWAY_MCP_AUTHENTICATED", "true");
  const quicknodeEvidenceBlockers = input.files.has("services/backend/fixtures/quicknode-filter-test.json")
    ? validateQuickNodeFilterEvidence(input.quicknodeFilterEvidence, {
      ...(input.environment.PROGRAM_ID?.trim() ? { programId: input.environment.PROGRAM_ID.trim() } : {}),
      ...(input.environment.STREAMS_TEST_BLOCK?.trim() ? { block: input.environment.STREAMS_TEST_BLOCK.trim() } : {}),
    })
    : ["saved verified QuickNode filter-test evidence is missing"];
  const streamId = input.environment.QUICKNODE_STREAM_ID?.trim();
  const destinationUrl = hasBackendUrl
    ? `${(input.environment.NEXT_PUBLIC_BACKEND_URL ?? input.environment.BACKEND_URL)!.trim().replace(/\/$/u, "")}/streams/webhook`
    : undefined;
  const quicknodeActiveStreamBlockers = input.files.has("services/backend/fixtures/quicknode-stream-active.json")
    ? validateQuickNodeActiveStreamEvidence(input.quicknodeActiveStreamEvidence, {
      ...(streamId ? { streamId } : {}),
      ...(input.environment.PROGRAM_ID?.trim() ? { programId: input.environment.PROGRAM_ID.trim() } : {}),
      ...(destinationUrl ? { destinationUrl } : {}),
      ...(input.expectedStreamFilterSha256 ? { filterSha256: input.expectedStreamFilterSha256 } : {}),
    })
    : ["saved verified QuickNode active-Stream evidence is missing"];
  const program = target([
    versionBlocker(input, "anchor", "0.31.1", "Anchor CLI"),
    versionBlocker(input, "solana", "2.2.20", "Solana CLI"),
    versionBlocker(input, "rustc", "1.85.1", "Rust"),
    versionBlocker(input, "pnpm", "11.25.0", "pnpm"),
    !input.commands.has("spl-token") && "SPL Token CLI is unavailable",
    !hasProgramId && "PROGRAM_ID is missing",
    !present(input.environment, "ADMIN_KEYPAIR") && "ADMIN_KEYPAIR is missing",
    !present(input.environment, "KEEPER_KEYPAIR") && "KEEPER_KEYPAIR is missing",
    !input.files.has("target/deploy/wick-keypair.json") && "program keypair is missing",
    !input.files.has("target/deploy/wick.so") && "compiled SBF program is missing",
    input.idlInstructionCount === 0 && "generated Anchor IDL is empty",
    !hasMint && "USDC_TEST_MINT is missing",
  ]);
  const backend = target([
    !hasRailwayCliAccess && !hasRailwayMcpAccess && "authenticated Railway CLI or MCP access is missing",
    !present(input.environment, "RAILWAY_PROJECT_ID") && "RAILWAY_PROJECT_ID context evidence is missing",
    !present(input.environment, "RAILWAY_ENVIRONMENT_ID") && "RAILWAY_ENVIRONMENT_ID context evidence is missing",
    !present(input.environment, "RAILWAY_SERVICE_ID") && "RAILWAY_SERVICE_ID context evidence is missing",
    !/^[0-9a-f]{40}$/i.test(input.environment.RAILWAY_SOURCE_COMMIT?.trim() ?? "") && "Railway source commit evidence must be a full Git commit SHA",
    input.environment.RAILWAY_DOCKERFILE_PATH?.trim() !== "services/backend/Dockerfile" && "Railway Dockerfile path evidence must be services/backend/Dockerfile",
    input.environment.RAILWAY_VOLUME_MOUNT?.trim() !== "/data" && "Railway volume mount evidence must be /data",
    !publicHttps(input.environment.RAILWAY_PUBLIC_DOMAIN?.trim()) && "Railway public domain evidence must be a public HTTPS URL",
    input.environment.RAILWAY_DEPLOYMENT_STATUS?.trim() !== "SUCCESS" && "Railway terminal deployment status evidence must be SUCCESS",
    !input.files.has("services/backend/Dockerfile") && "backend Dockerfile is missing",
    !input.files.has("services/backend/railway.json") && "Railway service manifest is missing",
    !hasProgramId && "PROGRAM_ID is missing",
    !hasMint && "USDC_TEST_MINT is missing",
    !present(input.environment, "KEEPER_KEYPAIR") && "KEEPER_KEYPAIR is missing",
    !present(input.environment, "STREAMS_WEBHOOK_SECRET") && "STREAMS_WEBHOOK_SECRET is missing",
    !input.backendChainAdapterConfigured && "backend chain adapter is explicitly unconfigured",
  ]);
  const frontend = target([
    !input.commands.has("vercel") && "Vercel CLI is unavailable",
    !present(input.environment, "VERCEL_TOKEN") && "VERCEL_TOKEN is missing",
    !present(input.environment, "VERCEL_PROJECT_ID") && "VERCEL_PROJECT_ID context evidence is missing",
    !present(input.environment, "VERCEL_ORG_ID") && "VERCEL_ORG_ID context evidence is missing",
    !input.files.has("vercel.json") && "Vercel monorepo manifest is missing",
    !hasBackendUrl && "NEXT_PUBLIC_BACKEND_URL is missing",
    !hasFrontendProgramId && "NEXT_PUBLIC_PROGRAM_ID/PROGRAM_ID is missing",
    !hasFrontendMint && "NEXT_PUBLIC_USDC_TEST_MINT/USDC_TEST_MINT is missing",
    !present(input.environment, "TREASURY_KEYPAIR") && "TREASURY_KEYPAIR is missing for the demo faucet",
  ]);
  const quicknodeStream = target([
    !present(input.environment, "QUICKNODE_API_KEY") && "QUICKNODE_API_KEY is missing",
    !present(input.environment, "QUICKNODE_RPC_URL") && "QUICKNODE_RPC_URL is missing",
    !hasProgramId && "PROGRAM_ID is missing",
    !hasBackendUrl && "public HTTPS backend URL is missing",
    !present(input.environment, "STREAMS_WEBHOOK_SECRET") && "STREAMS_WEBHOOK_SECRET is missing",
    !present(input.environment, "STREAMS_TEST_BLOCK") && "verified devnet program transaction block is missing",
    !streamId && "QUICKNODE_STREAM_ID is missing",
    ...quicknodeEvidenceBlockers,
    ...quicknodeActiveStreamBlockers,
  ]);
  return {
    program,
    backend,
    frontend,
    quicknodeStream,
    allReady: program.ready && backend.ready && frontend.ready && quicknodeStream.ready,
  };
}
