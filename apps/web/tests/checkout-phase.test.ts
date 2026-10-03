import { describe, expect, it } from "vitest";
import {
  canRetry,
  inFlight,
  phaseNote,
  checkoutAnnouncement,
  stepStates,
  type CheckoutPhase,
} from "../src/payments/checkout-phase";

const phases: CheckoutPhase[] = [
  { kind: "ready" },
  { kind: "preparing" },
  { kind: "approving" },
  { kind: "rejected" },
  { kind: "sending" },
  { kind: "confirming" },
  { kind: "confirming", uncertain: true },
  { kind: "verifying" },
  { kind: "failed" },
  { kind: "expired" },
  { kind: "error", message: "Insufficient USDC." },
  { kind: "unavailable" },
];

describe("checkout phase steps", () => {
  it("maps every phase to the five payment steps", () => {
    expect(stepStates({ kind: "ready" })).toEqual([
      "active",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
    expect(stepStates({ kind: "preparing" })).toEqual([
      "active",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
    expect(stepStates({ kind: "approving" })).toEqual([
      "done",
      "active",
      "todo",
      "todo",
      "todo",
    ]);
    expect(stepStates({ kind: "rejected" })).toEqual([
      "done",
      "error",
      "todo",
      "todo",
      "todo",
    ]);
    expect(stepStates({ kind: "sending" })).toEqual([
      "done",
      "done",
      "active",
      "todo",
      "todo",
    ]);
    expect(stepStates({ kind: "confirming" })).toEqual([
      "done",
      "done",
      "done",
      "active",
      "todo",
    ]);
    expect(stepStates({ kind: "unavailable" })).toEqual([
      "done",
      "done",
      "done",
      "active",
      "todo",
    ]);
    expect(stepStates({ kind: "verifying" })).toEqual([
      "done",
      "done",
      "done",
      "done",
      "active",
    ]);
    expect(stepStates({ kind: "failed" })).toEqual([
      "done",
      "done",
      "done",
      "error",
      "todo",
    ]);
    expect(stepStates({ kind: "expired" })).toEqual([
      "done",
      "done",
      "done",
      "error",
      "todo",
    ]);
    expect(stepStates({ kind: "error", message: "x" })).toEqual([
      "error",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
    expect(
      stepStates({ kind: "error", message: "x", at: "approve" }),
    ).toEqual(["done", "error", "todo", "todo", "todo"]);
    expect(stepStates({ kind: "error", message: "x", at: "send" })).toEqual([
      "done",
      "done",
      "error",
      "todo",
      "todo",
    ]);
    expect(stepStates({ kind: "error", message: "x", at: "review" })).toEqual([
      "error",
      "todo",
      "todo",
      "todo",
      "todo",
    ]);
  });

  it("gives every phase exactly one active or error step, except ready", () => {
    for (const phase of phases) {
      const marked = stepStates(phase).filter(
        (state) => state === "active" || state === "error",
      );
      if (phase.kind === "ready") expect(marked).toEqual(["active"]);
      else expect(marked).toHaveLength(1);
    }
  });

  it("allows a retry only from settled phases", () => {
    expect(canRetry({ kind: "ready" })).toBe(true);
    expect(canRetry({ kind: "rejected" })).toBe(true);
    expect(canRetry({ kind: "failed" })).toBe(true);
    expect(canRetry({ kind: "expired" })).toBe(true);
    expect(canRetry({ kind: "error", message: "x" })).toBe(true);
    expect(canRetry({ kind: "preparing" })).toBe(false);
    expect(canRetry({ kind: "approving" })).toBe(false);
    expect(canRetry({ kind: "sending" })).toBe(false);
    expect(canRetry({ kind: "confirming" })).toBe(false);
    expect(canRetry({ kind: "verifying" })).toBe(false);
    expect(canRetry({ kind: "unavailable" })).toBe(false);
  });

  it("is only in flight while preparing, approving or sending", () => {
    for (const phase of phases)
      expect(inFlight(phase)).toBe(
        ["preparing", "approving", "sending"].includes(phase.kind),
      );
  });

  it("describes each phase once, with an uncertain submission variant", () => {
    expect(phaseNote({ kind: "ready" })).toBeNull();
    expect(phaseNote({ kind: "error", message: "x" })).toBeNull();
    expect(phaseNote({ kind: "confirming" })).toContain("safely reload");
    expect(phaseNote({ kind: "confirming", uncertain: true })).toContain(
      "uncertain",
    );
    expect(phaseNote({ kind: "rejected" })).toContain("Nothing was sent");
    for (const phase of phases)
      if (!["ready", "error"].includes(phase.kind))
        expect(phaseNote(phase)).toBeTruthy();
  });
});

describe("checkoutAnnouncement", () => {
  it("announces payment progress until a receipt exists", () => {
    expect(checkoutAnnouncement({ kind: "confirming" }, false)).toContain(
      "safely reload",
    );
    expect(checkoutAnnouncement({ kind: "ready" }, false)).toBe("");
  });
  it("never announces payment progress over a receipt", () => {
    for (const phase of [
      { kind: "confirming" },
      { kind: "verifying" },
      { kind: "unavailable" },
    ] as const)
      expect(checkoutAnnouncement(phase, true)).toBe("");
  });
});
