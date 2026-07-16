import chalk from "chalk";
import type { Command } from "commander";
import { deleteApiKeysId, getApiKeys, postApiKeys } from "../client/sdk.gen";
import type { ApiKeyScope } from "../client/types.gen";
import { configureClient, fail, unwrap } from "../lib/api";
import { confirm } from "../lib/input";
import { print, printNextCursor, resolveColumns, toCsv } from "../lib/output";

/** Columns shown in `api-keys list` — never the secret (the API never returns it). */
const COLUMNS = [
  "name",
  "keyPrefix",
  "scope",
  "lastUsedAt",
  "expiresAt",
  "revokedAt",
];

/**
 * `ft api-keys` — self-service API key management. Kept separate from
 * registerResource because `create` prints the plaintext secret exactly once
 * (special UX) and `revoke` is a DELETE that we present as a revoke.
 */
export function registerApiKeys(program: Command): void {
  const root = program
    .command("api-keys")
    .description("Self-service API keys: create, list, revoke");

  root
    .command("create <name>")
    .description("Mint a new API key (the secret is shown only once)")
    .option("--scope <read|write>", "key scope", "read")
    .option("--expires <iso>", "expiry as ISO 8601 (e.g. 2027-01-01)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output (includes the plaintext secret)")
    .action(async (name, opts) => {
      const scope = opts.scope as string;
      if (scope !== "read" && scope !== "write") {
        fail("Invalid --scope. Use `read` or `write`.");
      }
      configureClient(opts.workspace);
      const body = unwrap(
        await postApiKeys({
          body: {
            name,
            scope: scope as ApiKeyScope,
            ...(opts.expires ? { expiresAt: opts.expires } : {}),
          },
        }),
      );
      const key = body.data;

      if (opts.json) {
        print(key, { json: true });
        return;
      }

      // The secret is returned only on creation — surface it prominently and
      // warn that it will never be shown again.
      console.log(
        `\n${chalk.green("✓")} API key "${chalk.bold(key.name)}" created (scope: ${key.scope}).\n`,
      );
      console.log(
        chalk.yellow("  Copy your secret now — it will NOT be shown again:\n"),
      );
      console.log(`    ${chalk.bold.cyan(key.key)}\n`);
      print(
        {
          id: key.id,
          name: key.name,
          scope: key.scope,
          keyPrefix: key.keyPrefix,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt,
        },
        {},
      );
    });

  root
    .command("list")
    .description("List your API keys (the secret is never returned)")
    .option("--limit <n>", "results per page (1-100)", "20")
    .option("--cursor <id>", "pagination cursor")
    .option("--all", "auto-paginate: fetch every page (ignores --cursor)")
    .option("--columns <list>", "comma-separated columns to display")
    .option("--full", "show every field instead of the curated columns")
    .option("--workspace <id>", "workspace override")
    .option("--csv", "CSV output (for spreadsheets)")
    .option("--json", "raw JSON output (data only)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const columns = resolveColumns(opts, COLUMNS);
      const query: Record<string, unknown> = {
        limit: opts.limit,
        cursor: opts.cursor,
      };

      if (opts.all) {
        const rows: unknown[] = [];
        let cursor: string | undefined;
        let page: { nextCursor?: string | null; hasMore?: boolean } | undefined;
        do {
          const body = unwrap(
            await getApiKeys({ query: { ...query, cursor } }),
          );
          rows.push(...(body.data ?? []));
          page = body.page;
          cursor = page?.nextCursor ?? undefined;
        } while (page?.hasMore && cursor);
        if (opts.csv) {
          process.stdout.write(`${toCsv(rows, columns)}\n`);
          return;
        }
        print(rows, { json: opts.json, columns });
        return;
      }

      const body = unwrap(await getApiKeys({ query }));
      if (opts.csv) {
        process.stdout.write(`${toCsv(body.data, columns)}\n`);
        return;
      }
      print(body.data, { json: opts.json, columns });
      if (!opts.json) printNextCursor(body.page);
    });

  root
    .command("revoke <id>")
    .description("Revoke one of your API keys")
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      if (!opts.yes && !(await confirm(`Revoke API key ${id}?`))) {
        console.error("Aborted.");
        return;
      }
      configureClient(opts.workspace);
      const body = unwrap(await deleteApiKeysId({ path: { id } }));
      print(body?.data ?? { revoked: id }, { json: opts.json });
    });
}
