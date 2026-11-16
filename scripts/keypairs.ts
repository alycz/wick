import { Keypair } from "@solana/web3.js";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function loadOrCreateKeypair(path: string): Promise<Keypair> {
  const absolute = resolve(path);
  try {
    const bytes = JSON.parse(await readFile(absolute, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const keypair = Keypair.generate();
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  await writeFile(absolute, `${JSON.stringify([...keypair.secretKey])}\n`, { mode: 0o600 });
  await chmod(absolute, 0o600);
  return keypair;
}
