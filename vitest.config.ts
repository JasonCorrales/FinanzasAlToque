import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"]
    }
  }
});
