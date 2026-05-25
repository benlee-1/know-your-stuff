import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    pool: "forks",
    include: ["__tests__/**/*.test.ts"],
    server: {
      deps: {
        external: [/^node:/],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
