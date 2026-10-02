import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "delete expired sign-in nonces and sessions",
  { minutes: 30 },
  internal.auth.cleanup,
  {},
);

export default crons;
