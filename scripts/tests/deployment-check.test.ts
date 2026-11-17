import { describe, expect, it } from "vitest";
import { evaluateDeploymentReadiness } from "../lib/deployment-check.js";
import { renderIdlModule } from "../sync-idl.js";

describe("deployment readiness", () => {
  it("fails closed without credentials, generated artifacts and a chain adapter", () => {
    const result = evaluateDeploymentReadiness({
      commands: new Set(), files: new Set(), environment: {}, idlInstructionCount: 0,
      backendChainAdapterConfigured: false,
    });
    expect(result.allReady).toBe(false);
    expect(result.program.blockers).toContain("generated Anchor IDL is empty");
    expect(result.backend.blockers).toContain("backend chain adapter is explicitly unconfigured");
    expect(result.quicknodeStream.blockers).toContain("verified devnet program transaction block is missing");
  });

  it("requires the full ordered deployment evidence before reporting ready", () => {
    const result = evaluateDeploymentReadiness({
      commands: new Set(["anchor", "solana", "spl-token", "railway", "vercel"]),
      files: new Set([
        "target/deploy/wick-keypair.json", "target/deploy/wick.so", "services/backend/Dockerfile",
        "services/backend/railway.json", "services/backend/fixtures/quicknode-filter-test.json", "vercel.json",
      ]),
      environment: {
        PROGRAM_ID: "program", USDC_TEST_MINT: "mint", ADMIN_KEYPAIR: "admin", KEEPER_KEYPAIR: "keeper",
        TREASURY_KEYPAIR: "treasury", RAILWAY_TOKEN: "railway",
        VERCEL_TOKEN: "vercel", NEXT_PUBLIC_BACKEND_URL: "https://api.example", STREAMS_WEBHOOK_SECRET: "secret",
        QUICKNODE_API_KEY: "quicknode", QUICKNODE_RPC_URL: "https://rpc.example", STREAMS_TEST_BLOCK: "123",
      },
      idlInstructionCount: 1,
      backendChainAdapterConfigured: true,
    });
    expect(result.allReady).toBe(true);
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
