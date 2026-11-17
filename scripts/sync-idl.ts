import { PublicKey } from "@solana/web3.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface AnchorIdl {
  address?: string;
  instructions?: unknown[];
  [key: string]: unknown;
}

export function renderIdlModule(idl: AnchorIdl): string {
  if (!idl.address) throw new Error("Generated Anchor IDL has no program address");
  new PublicKey(idl.address);
  if (!Array.isArray(idl.instructions) || idl.instructions.length === 0) throw new Error("Generated Anchor IDL has no instructions");
  return `// Generated from target/idl/wick.json by scripts/sync-idl.ts.\nexport const WICK_IDL = ${JSON.stringify(idl, null, 2)} as const;\n\nexport const WICK_PROGRAM_ID = WICK_IDL.address;\n`;
}

export async function syncIdl(
  source = resolve("target/idl/wick.json"),
  destination = resolve("packages/shared/src/idl.ts"),
): Promise<void> {
  const idl = JSON.parse(await readFile(source, "utf8")) as AnchorIdl;
  await writeFile(destination, renderIdlModule(idl), "utf8");
  console.info(JSON.stringify({ event: "idl_synced", source, destination, address: idl.address, instructions: idl.instructions?.length ?? 0 }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await syncIdl();
