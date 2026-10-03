import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "edge-runtime",
    env: { SIGN_IN_SECRET: "test-sign-in-secret-0123456789abcdef" },
  },
});
