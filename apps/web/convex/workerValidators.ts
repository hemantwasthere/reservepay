import { v } from "convex/values";

export const workerName = v.union(
  v.literal("keeper"),
  v.literal("reconcile"),
  v.literal("notifications"),
);
export const workerIssue = v.union(
  v.literal("unconfigured"),
  v.literal("failed"),
  v.literal("incomplete"),
  v.literal("low_funds"),
  v.null(),
);
