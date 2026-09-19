import chalk from "chalk";
import type { Command } from "commander";
import { getMe } from "../client/sdk.gen";
import { configureClient, fail, unwrap } from "../lib/api";
import { loadConfig, saveConfig } from "../lib/config";
import { print } from "../lib/output";

/**
 * `ft workspace list|use|clear|show`: pin, unpin and inspect the workspace.
 * Everything comes from GET /me (workspaces[] + activeWorkspaceId).
 *
 * Pinning is **opt-in**: by default nothing is stored, the lists read every
 * workspace the account reaches and the rest of the commands fall back to the
 * account's default one. `use` stores the choice and sends it as the
 * `X-Workspace-Id` header on every request — which is also what makes deep
 * pagination possible, since a cursor only means something inside one
 * workspace. `clear` puts it back to reading all of them.
 */
export function registerWorkspace(program: Command): void {
  const root = program
    .command("workspace")
    .description("List, pin, unpin, and show workspaces");

  root
    .command("list")
    .alias("ls")
    .description("List the workspaces you can access (marks the pinned one)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient();
      const me = unwrap(await getMe({})).data;
      const activeId = loadConfig().workspaceId ?? me.activeWorkspaceId;
      // `role` is the EFFECTIVE role in that workspace (contract 1.7.0), not
      // the account-wide one: the same session can be ADMIN here and VIEWER
      // there. `sections`: null = unrestricted, [] = access expired or revoked.
      const rows = me.workspaces.map((w) => ({
        active: w.id === activeId ? "*" : "",
        id: w.id,
        name: w.name,
        slug: w.slug,
        role: w.role,
        access:
          w.sections === null
            ? "full"
            : w.sections.length === 0
              ? "revoked"
              : w.sections.join("|"),
      }));
      print(rows, {
        json: opts.json,
        columns: ["active", "id", "name", "slug", "role", "access"],
      });
    });

  root
    .command("use <idOrSlug>")
    .description(
      "Pin every command to one workspace (persisted in ~/.freeticket/config.json)",
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
    .command("clear")
    .description("Unpin: go back to reading every workspace you can access")
    .action(() => {
      // `undefined` disappears in JSON.stringify, so the key leaves the file
      // instead of being merged back in from what was already stored.
      saveConfig({ workspaceId: undefined });
      console.log(
        `${chalk.green("✓")} No workspace pinned: lists now read all of them.`,
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
          "No workspace pinned and the account has no default one.",
          "Pick one with `ft workspace use <slug>`, or list them with `ft workspace list`.",
        );
      }
      print(active, { json: opts.json });
    });
}
