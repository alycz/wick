import { describe, expect, it } from "vitest";
import { evaluateDeploymentReadiness, type DeploymentInputs } from "../lib/deployment-check.js";
import { renderIdlModule } from "../sync-idl.js";

const signature = "1".repeat(88);

function completeInput(overrides: Partial<DeploymentInputs> = {}): DeploymentInputs {
  const environment: NodeJS.ProcessEnv = {
    PROGRAM_ID: "program", USDC_TEST_MINT: "mint", ADMIN_KEYPAIR: "admin", KEEPER_KEYPAIR: "keeper",
    TREASURY_KEYPAIR: "treasury", RAILWAY_TOKEN: "railway", RAILWAY_PROJECT_ID: "project",
    RAILWAY_ENVIRONMENT_ID: "environment", RAILWAY_SERVICE_ID: "service",
    RAILWAY_SOURCE_COMMIT: "a".repeat(40), RAILWAY_DOCKERFILE_PATH: "services/backend/Dockerfile",
    RAILWAY_VOLUME_MOUNT: "/data", RAILWAY_PUBLIC_DOMAIN: "https://wick.example",
    RAILWAY_DEPLOYMENT_STATUS: "SUCCESS", VERCEL_TOKEN: "vercel", VERCEL_PROJECT_ID: "vercel-project",
    VERCEL_ORG_ID: "vercel-org", NEXT_PUBLIC_BACKEND_URL: "https://api.example",
    STREAMS_WEBHOOK_SECRET: "secret", QUICKNODE_API_KEY: "quicknode",
    QUICKNODE_RPC_URL: "https://rpc.example", STREAMS_TEST_BLOCK: "123",
  };
  return {
    commands: new Set(["anchor", "solana", "rustc", "pnpm", "spl-token", "railway", "vercel"]),
    commandVersions: new Map([
      ["anchor", "anchor-cli 0.31.1"], ["solana", "solana-cli 2.2.20"],
      ["rustc", "rustc 1.85.1 (4eb161250 2025-03-15)"], ["pnpm", "11.25.0"],
    ]),
    files: new Set([
      "target/deploy/wick-keypair.json", "target/deploy/wick.so", "services/backend/Dockerfile",
      "services/backend/railway.json", "services/backend/fixtures/quicknode-filter-test.json", "vercel.json",
    ]),
    environment,
    idlInstructionCount: 1,
    backendChainAdapterConfigured: true,
    quicknodeFilterEvidence: {
      schemaVersion: 1, network: "solana-devnet", dataset: "block", programId: "program", block: "123",
      matchedTransaction: { signature, slot: 123 }, verifiedAt: "2026-11-17T12:00:00.000Z",
      testResult: { matchedTransactions: [{ signature, slot: 123 }] },
    },
    ...overrides,
  };
}

describe("deployment readiness", () => {
  it("fails closed without credentials, generated artifacts and a chain adapter", () => {
    const result = evaluateDeploymentReadiness({
      commands: new Set(), commandVersions: new Map(), files: new Set(), environment: {}, idlInstructionCount: 0,
      backendChainAdapterConfigured: false, quicknodeFilterEvidence: undefined,
    });
    expect(result.allReady).toBe(false);
    expect(result.program.blockers).toContain("generated Anchor IDL is empty");
    expect(result.backend.blockers).toContain("backend chain adapter is explicitly unconfigured");
    expect(result.quicknodeStream.blockers).toContain("verified devnet program transaction block is missing");
  });

  it("rejects installed tools whose output does not match the pinned versions", () => {
    const input = completeInput({ commandVersions: new Map([
      ["anchor", "anchor-cli 0.30.1"], ["solana", "solana-cli 2.2.19"],
      ["rustc", "rustc 1.86.0"], ["pnpm", "11.24.0"],
    ]) });
    const result = evaluateDeploymentReadiness(input);
    expect(result.program.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("Anchor CLI must be 0.31.1"),
      expect.stringContaining("Solana CLI must be 2.2.20"),
      expect.stringContaining("Rust must be 1.85.1"),
      expect.stringContaining("pnpm must be 11.25.0"),
    ]));
  });

  it("accepts authenticated Railway MCP access but still requires concrete service evidence", () => {
    const input = completeInput({
      commands: new Set(["anchor", "solana", "rustc", "pnpm", "spl-token", "vercel"]),
      environment: { ...completeInput().environment, RAILWAY_TOKEN: undefined, RAILWAY_MCP_AUTHENTICATED: "true", RAILWAY_SERVICE_ID: undefined },
    });
    const result = evaluateDeploymentReadiness(input);
    expect(result.backend.blockers).not.toContain("authenticated Railway CLI or MCP access is missing");
    expect(result.backend.blockers).toContain("RAILWAY_SERVICE_ID context evidence is missing");
    expect(result.backend.ready).toBe(false);
  });

  it("does not accept a QuickNode fixture by existence alone", () => {
    const result = evaluateDeploymentReadiness(completeInput({ quicknodeFilterEvidence: { matchedTransactions: [{ signature, slot: 123 }] } }));
    expect(result.quicknodeStream.ready).toBe(false);
    expect(result.quicknodeStream.blockers).toContain("saved QuickNode filter-test evidence has an unsupported schema version");
  });

  it("requires the full ordered deployment evidence before reporting ready", () => {
    expect(evaluateDeploymentReadiness(completeInput()).allReady).toBe(true);
  });
});

describe("IDL sync", () => {
  it("renders a typed shared module only for a real instruction-bearing IDL", () => {
    const output = renderIdlModule({ address: "11111111111111111111111111111111", instructions: [{ name: "init" }] });
    expect(output).toContain("export const WICK_IDL");
    expect(output).toContain("WICK_PROGRAM_ID");
    expect(() => renderIdlModule({ address: "11111111111111111111111111111111", instructions: [] })).toThrow(/no instructions/);
  });
});
