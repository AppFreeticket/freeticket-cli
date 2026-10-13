import chalk from "chalk";
import type { Command } from "commander";
import { getMe } from "../client/sdk.gen";
import {
  accountsInScope,
  configureClient,
  describeError,
  fail,
  failIfNoneAnswered,
  resolveAccount,
  unwrap,
} from "../lib/api";
import {
  ENV_ACCOUNT,
  readConfig,
  saveAccount,
  saveConfig,
} from "../lib/config";
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
 *
 * With several accounts stored (`ft account`), `list` is the union of what
 * each one reaches and `use` pins the account that reaches the workspace too.
 */
export function registerWorkspace(program: Command): void {
  const root = program
    .command("workspace")
    .description("List, pin, unpin, and show workspaces");

  root
    .command("list")
    .alias("ls")
    .description(
      "List the workspaces you can access, across every account in scope (marks the pinned one)",
    )
    .option("--account <name>", "only this account (default: all stored)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      const accounts = accountsInScope();
      if (accounts.length === 0) resolveAccount(); // fails with "Not logged in"
      const withAccount = accounts.length > 1;
      const rows = [];
      const errors: string[] = [];
      let answered = 0;
      for (const account of accounts) {
        configureClient(undefined, account);
        const res = await getMe({});
        if (!res.data && withAccount) {
          // One expired login does not hide the other accounts' workspaces.
          errors.push(`account ${account.name}: ${describeError(res)}`);
          continue;
        }
        answered++;
        const me = unwrap(res).data;
        const activeId = account.workspaceId ?? me.activeWorkspaceId;
        // `role` is the EFFECTIVE role in that workspace (contract 1.7.0), not
        // the account-wide one: the same session can be ADMIN here and VIEWER
        // there. `sections`: null = unrestricted, [] = access expired or revoked.
        for (const w of me.workspaces)
          rows.push({
            ...(withAccount ? { account: account.name } : {}),
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
          });
      }
      failIfNoneAnswered(answered, errors);
      print(rows, {
        json: opts.json,
        columns: [
          ...(withAccount ? ["account"] : []),
          "active",
          "id",
          "name",
          "slug",
          "role",
          "access",
        ],
      });
    });

  root
    .command("use <idOrSlug>")
    .description(
      "Pin every command to one workspace, and to the account that reaches it (persisted in ~/.freeticket/config.json)",
    )
    .option("--account <name>", "only look in this account")
    .action(async (idOrSlug) => {
      const accounts = accountsInScope();
      if (accounts.length === 0) resolveAccount(); // fails with "Not logged in"
      const slugs: string[] = [];
      for (const account of accounts) {
        configureClient(undefined, account);
        const res = await getMe({});
        if (!res.data && accounts.length > 1) continue;
        const me = unwrap(res).data;
        const match = me.workspaces.find(
          (w) => w.id === idOrSlug || w.slug === idOrSlug,
        );
        slugs.push(...me.workspaces.map((w) => w.slug));
        if (!match) continue;
        const stored = readConfig().accounts?.[account.name];
        if (stored)
          saveAccount(account.name, { ...stored, workspaceId: match.id });
        // With several logins the workspace only means something through the
        // account that reaches it, so that account is pinned too.
        if (
          account.name !== ENV_ACCOUNT &&
          Object.keys(readConfig().accounts ?? {}).length > 1
        )
          saveConfig({ activeAccount: account.name });
        console.log(
          `${chalk.green("✓")} Active workspace: ${chalk.bold(match.name)} ${chalk.dim(`(${match.slug})`)}` +
            (accounts.length > 1 ? ` ${chalk.dim(`via ${account.name}`)}` : ""),
        );
        return;
      }
      fail(
        `No workspace matches "${idOrSlug}".`,
        `Available: ${slugs.join(", ") || "(none)"}`,
      );
    });

  root
    .command("clear")
    .description(
      "Unpin: go back to reading every workspace (and every account) you can access",
    )
    .option("--account <name>", "only unpin this account's workspace")
    .action((opts) => {
      const file = readConfig();
      const names = opts.account
        ? [opts.account as string]
        : Object.keys(file.accounts ?? {});
      for (const name of names) {
        const stored = file.accounts?.[name];
        if (!stored) fail(`No account named "${name}".`);
        // `undefined` disappears in JSON.stringify, so the key leaves the file
        // instead of being merged back in from what was already stored.
        saveAccount(name, { ...stored, workspaceId: undefined });
      }
      // A pinned account came with the workspace (`ft workspace use`), so it
      // goes with it, and so does the FT_API_KEY pin. `--account` only touches
      // that one account.
      if (!opts.account)
        saveConfig({ activeAccount: undefined, workspaceId: undefined });
      console.log(
        `${chalk.green("✓")} No workspace pinned: lists now read all of them.`,
      );
    });

  root
    .command("show")
    .description("Show the active workspace")
    .option(
      "--account <name>",
      "the account to ask (needed when several are stored)",
    )
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      const account = resolveAccount();
      configureClient(undefined, account);
      const me = unwrap(await getMe({})).data;
      const activeId = account.workspaceId ?? me.activeWorkspaceId;
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
