import pkg from "../package.json" with { type: "json" };
import { banner } from "./lib/banner";
import { notifyUpdate } from "./lib/update-check";
import { program } from "./program";

// No arguments -> banner + help.
if (process.argv.length <= 2) {
  console.log(banner());
  program.outputHelp();
  process.exit(0);
}

program
  .parseAsync()
  // After the command runs, drop a one-line update notice on stderr (once/day,
  // TTY-only). Never blocks or fails the command.
  .then(() => notifyUpdate(pkg.version))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
