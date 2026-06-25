import chalk from "chalk";
import type { Command } from "commander";
import { getMe } from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { CONFIG_PATH, loadConfig, saveConfig } from "../lib/config";
import { print } from "../lib/output";

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description("Store the API key and workspace in ~/.freeticket/config.json")
    .requiredOption(
      "--key <ft_live_…>",
      "API key issued in the backend (pnpm api:key)",
    )
    .option(
      "--url <url>",
      "API base URL (default: https://admin.appfreeticket.com)",
    )
    .option("--workspace <id>", "default active workspace")
    .action(async (opts) => {
      saveConfig({
        apiKey: opts.key,
        ...(opts.url ? { apiUrl: opts.url } : {}),
        ...(opts.workspace ? { workspaceId: opts.workspace } : {}),
      });
      // Verify the key against /me before reporting success.
      configureClient(opts.workspace);
      const me = unwrap(await getMe({})).data;
      console.log(
        `${chalk.green("✓")} Session saved in ${chalk.dim(CONFIG_PATH)}`,
      );
      print(me, {});
    });

  program
    .command("whoami")
    .description("Show the authenticated user and workspaces (GET /me)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient();
      const me = unwrap(await getMe({})).data;
      print(me, { json: opts.json });
    });

  program
    .command("logout")
    .description("Remove the stored API key")
    .action(() => {
      saveConfig({ apiKey: undefined });
      console.log(
        `${chalk.green("✓")} API key removed from ${chalk.dim(CONFIG_PATH)}`,
      );
    });

  program
    .command("config")
    .description("Show active configuration (the API key is masked)")
    .action(() => {
      const cfg = loadConfig();
      print(
        {
          apiUrl: cfg.apiUrl,
          apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 12)}…` : null,
          workspaceId: cfg.workspaceId ?? null,
        },
        {},
      );
    });
}
