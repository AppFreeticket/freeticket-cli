import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Network and filesystem guard for every test file (see the file).
    setupFiles: ["src/test/setup.ts"],
  },
});
