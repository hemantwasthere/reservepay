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
  "delete old demo orders",
  { hours: 1 },
  internal.demoOrders.cleanup,
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

crons.interval(
  "deliver refund updates and protection reminders",
  { minutes: 2 },
  internal.notificationActions.run,
  {},
);

export default crons;
