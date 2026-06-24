import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  // shebang so npm links a runnable `ft` binary on every OS
  banner: { js: "#!/usr/bin/env node" },
});
