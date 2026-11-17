import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { access, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { assertDevnet, requiredEnv } from "./lib/runtime.js";
import { loadKeypair } from "./keypairs.js";
import { syncIdl } from "./sync-idl.js";

export interface DeploymentPlan {
  programId: string;
  programSo: string;
  programKeypair: string;
  authorityKeypair: string;
  rpcUrl: string;
}

export function deploymentPlan(environment: NodeJS.ProcessEnv = process.env): DeploymentPlan {
  return {
    programId: new PublicKey(requiredEnv("PROGRAM_ID", environment)).toBase58(),
    programSo: resolve(environment.PROGRAM_SO?.trim() || "target/deploy/wick.so"),
    programKeypair: resolve(environment.PROGRAM_KEYPAIR?.trim() || "target/deploy/wick-keypair.json"),
    authorityKeypair: environment.ADMIN_KEYPAIR?.trim() || ".keys/admin.json",
    rpcUrl: environment.PUBLIC_SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com",
  };
}

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolveRun() : reject(new Error(`${command} exited ${code ?? signal}`)));
  });
}

export async function deployProgram(options: { dryRun?: boolean } = {}): Promise<void> {
  const plan = deploymentPlan();
  if (options.dryRun) {
    console.info(JSON.stringify({ event: "deploy_dry_run", ...plan, submitted: false }));
    return;
  }
  const authority = await loadKeypair(plan.authorityKeypair, "ADMIN_KEYPAIR");
  const connection = new Connection(plan.rpcUrl, "confirmed");
  await assertDevnet(connection);
  await run("anchor", ["build"]);
  await syncIdl();
  await Promise.all([access(plan.programSo), access(plan.programKeypair)]);
  const programSecret = JSON.parse(await readFile(plan.programKeypair, "utf8")) as number[];
  const keypairId = Keypair.fromSecretKey(Uint8Array.from(programSecret)).publicKey;
  if (keypairId.toBase58() !== plan.programId) throw new Error(`PROGRAM_ID ${plan.programId} does not match ${plan.programKeypair} (${keypairId.toBase58()})`);
  const programSize = (await stat(plan.programSo)).size;
  const maxLen = Math.ceil(programSize * 1.2 / 1_024) * 1_024;
  await run("solana", ["program", "deploy", plan.programSo, "--program-id", plan.programKeypair, "--keypair", plan.authorityKeypair, "--url", plan.rpcUrl, "--max-len", String(maxLen), "--with-compute-unit-price", "0"]);
  const account = await connection.getAccountInfo(new PublicKey(plan.programId), "confirmed");
  if (!account?.executable) throw new Error("Deploy command returned, but the devnet program account is not executable");
  console.info(JSON.stringify({ event: "program_deployed", programId: plan.programId, executable: true, programBytes: programSize, maxLen, authority: authority.publicKey.toBase58() }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await deployProgram({ dryRun: process.argv.includes("--dry-run") });
