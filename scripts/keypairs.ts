import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
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

/** Loads an existing secret only. Operational scripts never create an authority implicitly. */
export async function loadKeypair(value: string, label = "keypair"): Promise<Keypair> {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required`);
  try {
    if (trimmed.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(trimmed) as number[]));
    if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmed)) return Keypair.fromSecretKey(bs58.decode(trimmed));
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(resolve(trimmed), "utf8")) as number[]));
  } catch (error) {
    throw new Error(`${label} could not be loaded: ${error instanceof Error ? error.message : String(error)}`);
  }
}
