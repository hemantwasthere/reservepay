import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// One program build for CI, `bun run test:program` and devnet redeploys.
// cargo-build-sbf only *warns* when an instruction's stack frame exceeds the
// 4096-byte SBF limit, and such a program deploys fine and then fails at
// runtime with "Access violation in stack frame". So fail the build on that
// warning here, in the one place every build goes through.
// --ignore-keys: fresh clones lack the deployer's program keypair; never run
// `anchor keys sync`, which would rewrite the program ID.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
export const STACK_OVERFLOW = /Stack offset of \d+ exceeded max offset of \d+/;

export function stackOverflowLines(log: string): string[] {
  return log.split("\n").filter((line) => STACK_OVERFLOW.test(line));
}

async function build(extraArgs: string[]): Promise<number> {
  const child = spawn("anchor", ["build", "--ignore-keys", ...extraArgs], {
    cwd: root,
    stdio: ["inherit", "pipe", "pipe"],
  });
  // Each pipe can split a diagnostic across chunks. Mixing the streams can
  // insert unrelated progress output into the middle of that diagnostic.
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
    stderr += chunk.toString();
  });
  const code = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      console.error(`Could not run anchor: ${error.message}`);
      resolve(127);
    });
    child.on("close", (exitCode) => resolve(exitCode ?? 1));
  });
  if (code !== 0) return code;
  const overflows = [
    ...stackOverflowLines(stdout),
    ...stackOverflowLines(stderr),
  ];
  if (overflows.length > 0) {
    console.error(
      "\nAn instruction's stack frame exceeds the 4096-byte SBF limit. The " +
        "program would deploy and then fail at runtime. Box the large accounts " +
        "in the reported context:\n" +
        overflows.map((line) => `  ${line.trim()}`).join("\n"),
    );
    return 1;
  }
  return 0;
}

if (import.meta.main) process.exit(await build(process.argv.slice(2)));
