import chalk from "chalk";
import type { Command } from "commander";
import { getMe } from "../client/sdk.gen";
import { configureClient, fail, unwrap } from "../lib/api";
import { loadConfig, saveConfig } from "../lib/config";
import { print } from "../lib/output";

/**
 * `ft workspace list|use|show`: pick and persist the active workspace.
 * Everything comes from GET /me (workspaces[] + activeWorkspaceId); the choice
 * is stored locally and sent as the `X-Workspace-Id` header on every request.
 */
export function registerWorkspace(program: Command): void {
  const root = program
    .command("workspace")
    .description("List, switch, and show the active workspace");

  root
    .command("list")
    .alias("ls")
    .description("List the workspaces you can access (marks the active one)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient();
      const me = unwrap(await getMe({})).data;
      const activeId = loadConfig().workspaceId ?? me.activeWorkspaceId;
      const rows = me.workspaces.map((w) => ({
        active: w.id === activeId ? "*" : "",
        id: w.id,
        name: w.name,
        slug: w.slug,
      }));
      print(rows, {
        json: opts.json,
        columns: ["active", "id", "name", "slug"],
      });
    });

  root
    .command("use <idOrSlug>")
    .description(
      "Set the active workspace (persisted in ~/.freeticket/config.json)",
    )
    .action(async (idOrSlug) => {
      configureClient();
      const me = unwrap(await getMe({})).data;
      const match = me.workspaces.find(
        (w) => w.id === idOrSlug || w.slug === idOrSlug,
      );
      if (!match) {
        fail(
          `No workspace matches "${idOrSlug}".`,
          `Available: ${me.workspaces.map((w) => w.slug).join(", ") || "(none)"}`,
        );
      }
      saveConfig({ workspaceId: match.id });
      console.log(
        `${chalk.green("✓")} Active workspace: ${chalk.bold(match.name)} ${chalk.dim(`(${match.slug})`)}`,
      );
    });

  root
    .command("show")
    .description("Show the active workspace")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient();
      const cfg = loadConfig();
      const me = unwrap(await getMe({})).data;
      const activeId = cfg.workspaceId ?? me.activeWorkspaceId;
      const active = me.workspaces.find((w) => w.id === activeId);
      if (!active) {
        fail(
          "No active workspace set.",
          "Pick one with `ft workspace use <slug>`.",
        );
      }
      print(active, { json: opts.json });
    });
}
