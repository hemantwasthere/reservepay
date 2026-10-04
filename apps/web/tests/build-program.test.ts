// @vitest-environment node
import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stackOverflowLines } from "../scripts/build-program";

describe("program build stack guard", () => {
  it("finds cargo-build-sbf stack overflow warnings", () => {
    const log = [
      "   Compiling reservepay v0.1.0",
      "Error: Function _ZN10reservepay11CreateOrder12try_accounts17h1 Stack offset of 4608 exceeded max offset of 4096 by 512 bytes, please minimize large stack variables",
      "    Finished release [optimized] target(s)",
    ].join("\n");
    expect(stackOverflowLines(log)).toHaveLength(1);
    expect(stackOverflowLines(log)[0]).toContain("4608");
  });
  it("passes a clean build log", () => {
    const log = [
      "   Compiling reservepay v0.1.0",
      "    Finished release [optimized] target(s)",
      "Stack usage is fine", // not the warning
    ].join("\n");
    expect(stackOverflowLines(log)).toEqual([]);
  });

  it("rejects an overflow split around output from the other stream", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reservepay-build-"));
    try {
      // Wait for acknowledgements through inherited stdin so the wrapper
      // observes each chunk before the next one is emitted. No timing sleeps.
      writeFileSync(
        join(dir, "anchor"),
        `#!/usr/bin/env node
let phase = 0;
process.stdin.on("data", () => {
  if (phase++ === 0) process.stdout.write("IDL build progress\\n");
  else {
    process.stderr.write(" exceeded max offset of 4096 by 904 bytes\\n");
    process.stdin.destroy();
  }
});
process.stderr.write("Error: Function example Stack offset of 5000");
`,
        { mode: 0o755 },
      );
      const child = spawn(
        "bun",
        [
          fileURLToPath(
            new URL("../scripts/build-program.ts", import.meta.url),
          ),
        ],
        {
          env: {
            ...process.env,
            PATH: `${dir}${delimiter}${process.env.PATH}`,
          },
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 5_000,
        },
      );
      let stdout = "";
      let stderr = "";
      let acknowledgedWarning = false;
      let acknowledgedProgress = false;
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        if (!acknowledgedWarning && stderr.includes("Stack offset of 5000")) {
          acknowledgedWarning = true;
          child.stdin.write("warning received\n");
        }
      });
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
        if (!acknowledgedProgress && stdout.includes("IDL build progress")) {
          acknowledgedProgress = true;
          child.stdin.write("progress received\n");
        }
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", resolve);
      });
      expect(stdout).toContain("IDL build progress");
      expect(stderr).toContain(
        "Stack offset of 5000 exceeded max offset of 4096",
      );
      expect(code).toBe(1);
      expect(stderr).toContain("program would deploy and then fail at runtime");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 10_000);
});
