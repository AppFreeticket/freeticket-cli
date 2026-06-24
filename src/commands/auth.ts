import chalk from "chalk";
import type { Command } from "commander";
import { getMe } from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { CONFIG_PATH, loadConfig, saveConfig } from "../lib/config";
import { print } from "../lib/output";

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description(
      "Guarda la API key y el workspace en ~/.freeticket/config.json",
    )
    .requiredOption(
      "--key <ft_live_…>",
      "API key emitida en el backend (pnpm api:key)",
    )
    .option(
      "--url <url>",
      "base URL de la API (default: https://admin.appfreeticket.com)",
    )
    .option("--workspace <id>", "workspace activo por defecto")
    .action(async (opts) => {
      saveConfig({
        apiKey: opts.key,
        ...(opts.url ? { apiUrl: opts.url } : {}),
        ...(opts.workspace ? { workspaceId: opts.workspace } : {}),
      });
      // Verifica la key contra /me antes de declarar éxito.
      configureClient(opts.workspace);
      const me = unwrap(await getMe({})).data;
      console.log(
        `${chalk.green("✓")} Sesión guardada en ${chalk.dim(CONFIG_PATH)}`,
      );
      print(me, {});
    });

  program
    .command("whoami")
    .description("Muestra el usuario autenticado y sus workspaces (GET /me)")
    .option("--json", "salida JSON cruda")
    .action(async (opts) => {
      configureClient();
      const me = unwrap(await getMe({})).data;
      print(me, { json: opts.json });
    });

  program
    .command("logout")
    .description("Borra la API key guardada")
    .action(() => {
      saveConfig({ apiKey: undefined });
      console.log(
        `${chalk.green("✓")} API key eliminada de ${chalk.dim(CONFIG_PATH)}`,
      );
    });

  program
    .command("config")
    .description("Muestra la configuración activa (la API key se enmascara)")
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
