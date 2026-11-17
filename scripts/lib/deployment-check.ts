export interface DeploymentInputs {
  commands: ReadonlySet<string>;
  files: ReadonlySet<string>;
  environment: NodeJS.ProcessEnv;
  idlInstructionCount: number;
  backendChainAdapterConfigured: boolean;
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
  const program = target([
    !input.commands.has("anchor") && "Anchor CLI 0.31.1 is unavailable",
    !input.commands.has("solana") && "Solana CLI 2.2.20 is unavailable",
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
    !input.commands.has("railway") && "Railway CLI is unavailable",
    !present(input.environment, "RAILWAY_TOKEN", "RAILWAY_API_TOKEN") && "Railway token is missing",
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
    !input.files.has("vercel.json") && "Vercel monorepo manifest is missing",
    !hasBackendUrl && "NEXT_PUBLIC_BACKEND_URL is missing",
    !hasFrontendProgramId && "NEXT_PUBLIC_PROGRAM_ID/PROGRAM_ID is missing",
    !hasFrontendMint && "NEXT_PUBLIC_USDC_TEST_MINT/USDC_TEST_MINT is missing",
    !present(input.environment, "TREASURY_KEYPAIR") && "TREASURY_KEYPAIR is missing for the demo faucet",
    !present(input.environment, "FAUCET_AUTHORITY_KEYPAIR") && "FAUCET_AUTHORITY_KEYPAIR is missing",
  ]);
  const quicknodeStream = target([
    !present(input.environment, "QUICKNODE_API_KEY") && "QUICKNODE_API_KEY is missing",
    !present(input.environment, "QUICKNODE_RPC_URL") && "QUICKNODE_RPC_URL is missing",
    !hasProgramId && "PROGRAM_ID is missing",
    !hasBackendUrl && "public HTTPS backend URL is missing",
    !present(input.environment, "STREAMS_WEBHOOK_SECRET") && "STREAMS_WEBHOOK_SECRET is missing",
    !present(input.environment, "STREAMS_TEST_BLOCK") && "verified devnet program transaction block is missing",
    !input.files.has("services/backend/fixtures/quicknode-filter-test.json") && "saved successful QuickNode filter-test response is missing",
  ]);
  return {
    program,
    backend,
    frontend,
    quicknodeStream,
    allReady: program.ready && backend.ready && frontend.ready && quicknodeStream.ready,
  };
}
