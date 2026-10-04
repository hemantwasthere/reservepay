// @vitest-environment node
import { describe, expect, it } from "vitest";
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
});
