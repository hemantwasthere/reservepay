import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired sign-in nonces and sessions",
  { minutes: 30 },
  internal.auth.cleanup,
  {},
);

crons.interval(
  "release expired orders and reconcile disputes",
  { minutes: 5 },
  internal.keeperActions.run,
  {},
);

crons.interval(
  "reconcile payments with Solana",
  { minutes: 2 },
  internal.reconcileActions.run,
  {},
);

export default crons;
