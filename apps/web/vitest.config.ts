import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "edge-runtime",
    env: { SIGN_IN_SECRET: "test-sign-in-secret-0123456789abcdef" },
  },
});
