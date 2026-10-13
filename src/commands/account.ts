import chalk from "chalk";
import type { Command } from "commander";
import { fail } from "../lib/api";
import {
  CONFIG_PATH,
  DEFAULT_API_URL,
  readConfig,
  saveAccount,
  saveConfig,
} from "../lib/config";
import { print } from "../lib/output";
import { mask } from "./auth";

/**
 * `ft account list|use|clear|remove`: the logins stored side by side.
 *
 * Same opt-in rule as workspaces: with nothing pinned, the lists and the
 * row-shaped reports read every account × every workspace it reaches. `use`
 * pins one account (and `--account <name>` does it for one command); `clear`
 * goes back to all of them. Accounts are added with `ft login [--account]`.
 */
export function registerAccount(program: Command): void {
  const root = program
    .command("account")
    .alias("accounts")
    .description("List, pin, unpin and remove stored accounts");

  root
    .command("list")
    .alias("ls")
    .description("List stored accounts (marks the pinned one)")
    .option("--json", "raw JSON output")
    .action((opts) => {
      const { accounts = {}, activeAccount, apiUrl } = readConfig();
      // Read from the file only: asking each account's /me just to print a
      // list costs a round trip per login. `ft whoami` does that.
      const rows = Object.entries(accounts).map(([name, a]) => ({
        active: name === activeAccount ? "*" : "",
        name,
        apiUrl: a.apiUrl ?? apiUrl ?? DEFAULT_API_URL,
        workspaceId: a.workspaceId ?? "",
        session: mask(a.apiKey),
      }));
      print(rows, {
        json: opts.json,
        columns: ["active", "name", "apiUrl", "workspaceId", "session"],
      });
      if (rows.length === 0)
        console.error(chalk.dim("(no accounts: add one with `ft login`)"));
      else if (process.env.FT_API_KEY)
        console.error(
          chalk.dim("(FT_API_KEY is set: it overrides every stored account)"),
        );
    });

  root
    .command("use <name>")
    .description(
      "Pin every command to one account (persisted in ~/.freeticket/config.json)",
    )
    .action((name) => {
      const names = Object.keys(readConfig().accounts ?? {});
      if (!names.includes(name)) {
        fail(
          `No account named "${name}".`,
          `Stored: ${names.join(", ") || "(none) - add one with `ft login`"}`,
        );
      }
      saveConfig({ activeAccount: name });
      console.log(`${chalk.green("✓")} Active account: ${chalk.bold(name)}`);
    });

  root
    .command("clear")
    .description("Unpin: go back to reading every stored account")
    .action(() => {
      // `undefined` disappears in JSON.stringify, so the key leaves the file.
      saveConfig({ activeAccount: undefined });
      console.log(
        `${chalk.green("✓")} No account pinned: lists now read all of them.`,
      );
    });

  root
    .command("remove <name>")
    .alias("rm")
    .description("Remove a stored account (same as `ft logout --account`)")
    .action((name) => {
      const names = Object.keys(readConfig().accounts ?? {});
      if (!names.includes(name)) {
        fail(`No account named "${name}".`, `Stored: ${names.join(", ")}`);
      }
      saveAccount(name, undefined);
      console.log(
        `${chalk.green("✓")} Removed ${chalk.bold(name)} from ${chalk.dim(CONFIG_PATH)}`,
      );
    });
}
