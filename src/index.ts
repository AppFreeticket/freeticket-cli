import pkg from "../package.json" with { type: "json" };
import { banner } from "./lib/banner";
import { checkForUpdate } from "./lib/update-check";
import { program } from "./program";

// No arguments -> banner + help.
if (process.argv.length <= 2) {
  console.log(banner());
  program.outputHelp();
  process.exit(0);
}

// The registry lookup (≤1.5 s, once a day) starts alongside the command, so a
// slow network costs nothing on top of it. The notice itself is printed after
// the command's output, on stderr. Never blocks or fails the command.
const update = checkForUpdate(pkg.version);
program
  .parseAsync()
  .then(async () => {
    const notice = await update;
    if (notice) process.stderr.write(notice);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
