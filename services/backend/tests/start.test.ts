import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const children = new Set<ReturnType<typeof spawn>>();
const directories: string[] = [];

afterEach(async () => {
  for (const child of children) child.kill("SIGKILL");
  children.clear();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("production backend entrypoint", () => {
  it("starts without workspace module-resolution failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wick-backend-start-"));
    directories.push(directory);
    const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
        SQLITE_PATH: join(directory, "wick.db"),
        PROGRAM_ID: "",
        KEEPER_KEYPAIR: "",
        LOG_LEVEL: "info",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { output += chunk; });
    child.stderr.on("data", (chunk: string) => { output += chunk; });

    await waitFor(() => output.includes("Server listening at"), 15_000, () => output);
    expect(output).not.toContain("ERR_MODULE_NOT_FOUND");
    child.kill("SIGKILL");
    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    children.delete(child);
    expect(exit).toEqual({ code: null, signal: "SIGKILL" });
  }, 20_000);
});

async function waitFor(predicate: () => boolean, timeoutMs: number, diagnostics: () => string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Backend did not start before timeout. Output:\n${diagnostics()}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
