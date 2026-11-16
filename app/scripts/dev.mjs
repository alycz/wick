import { spawn } from "node:child_process";

const args = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (value === "--strictPort") continue;
  if (value === "--host") {
    args.push("-H");
    const host = process.argv[index + 1];
    if (host) { args.push(host); index += 1; }
    continue;
  }
  args.push(value);
}

const child = spawn("next", ["dev", ...args], { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
