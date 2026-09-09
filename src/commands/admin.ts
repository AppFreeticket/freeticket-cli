// biome-ignore-all lint/suspicious/noExplicitAny: generated SDK boundary — signatures vary by resource.
import chalk from "chalk";
import type { Command } from "commander";
import {
  deleteTokensId,
  getAuditLog,
  getFeatureFlags,
  getMe,
  getPlatformPlans,
  getPlatformPlansId,
  getTokens,
  getUsers,
  getUsersId,
  getWorkspaces,
  getWorkspacesId,
  patchPlatformPlansId,
  patchUsersId,
  patchWorkspacesId,
  postImpersonate,
  postImpersonateStop,
  postPlatformPlans,
  postTokens,
  postWorkspaces,
  postWorkspacesIdPlan,
  postWorkspacesIdRestore,
  postWorkspacesIdSuspend,
  putFeatureFlagsKey,
} from "../admin-client/sdk.gen";
import { configureAdminClient, unwrap } from "../lib/api";
import { CONFIG_PATH, loadConfig, saveConfig } from "../lib/config";
import { confirmOrExit, parseData } from "../lib/input";
import { print, printNextCursor, resolveColumns, toCsv } from "../lib/output";

type SdkFn = (
  opts: any,
) => Promise<{ data?: any; error?: unknown; response: Response }>;

/** Id-bound (or key-bound) custom mutation, e.g. workspaces suspend. */
interface AdminAction {
  name: string;
  describe: string;
  fn: SdkFn;
  /** Accepts a --data JSON body. */
  body?: boolean;
  /** Path param name (default "id"; feature-flags use "key"). */
  param?: string;
  /** Confirm before running (destructive). */
  confirm?: boolean;
}

interface AdminResource {
  name: string;
  describe: string;
  list?: SdkFn;
  get?: SdkFn;
  create?: SdkFn;
  update?: SdkFn;
  actions?: AdminAction[];
  columns?: string[];
  /** Extra list flags -> query entries. */
  listFlags?: { flag: string; describe: string; query: string }[];
  /** This list endpoint has no cursor pagination (e.g. feature-flags). */
  noPaging?: boolean;
}

/**
 * Superadmin commands (`ft admin <resource>`) against the /api/admin contract.
 * Reads + writes (create/update, suspend/restore, feature-flag set,
 * impersonate) behind confirmation on destructive ops.
 * Auth is a SUPER_ADMIN session, not an API key (see configureAdminClient).
 */
export function registerAdmin(program: Command): void {
  const admin = program
    .command("admin")
    .description("Superadmin (cross-tenant) — SUPER_ADMIN session required");

  admin
    .command("login")
    .description(
      "Save a SUPER_ADMIN session and validate it against /api/admin/me",
    )
    .requiredOption(
      "--session <token>",
      "the `better-auth.session_token` cookie value from an authenticated admin browser session",
    )
    .option(
      "--url <url>",
      "API base URL (default: https://admin.appfreeticket.com)",
    )
    .action(async (opts) => {
      if (opts.url) saveConfig({ apiUrl: opts.url });
      saveConfig({ adminSession: opts.session });
      // Verify before declaring success — a bad cookie fails here, not later.
      configureAdminClient();
      const me = unwrap(await getMe({})).data;
      console.log(
        `${chalk.green("✓")} Admin session saved in ${chalk.dim(CONFIG_PATH)}`,
      );
      print(me, {});
    });

  admin
    .command("logout")
    .description("Remove the stored superadmin session")
    .action(() => {
      saveConfig({ adminSession: undefined });
      console.log(
        `${chalk.green("✓")} Admin session removed from ${chalk.dim(CONFIG_PATH)}`,
      );
    });

  admin
    .command("config")
    .description("Show admin configuration (the session is masked)")
    .action(() => {
      const cfg = loadConfig();
      print(
        {
          apiUrl: cfg.apiUrl,
          adminSession: cfg.adminSession
            ? `${cfg.adminSession.slice(0, 12)}…`
            : null,
        },
        {},
      );
    });

  admin
    .command("me")
    .description("Current superadmin identity (GET /api/admin/me)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const body = unwrap(await getMe({}));
      print(body.data, { json: opts.json });
    });

  admin
    .command("impersonate")
    .description('Start impersonation (--data \'{"targetUserId":"..."}\')')
    .requiredOption("--data <json>", "JSON body (inline or @file.json)")
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const payload = parseData(opts.data) as { targetUserId?: string };
      // The most sensible action in the CLI: it acts in someone else's name.
      // `workspaces suspend` (reversible) already confirms; this did not.
      await confirmOrExit(
        `Impersonate user ${payload.targetUserId ?? "(no targetUserId in --data)"}?`,
        opts.yes,
      );
      const body = unwrap(await postImpersonate({ body: payload as never }));
      print(body?.data ?? body, { json: opts.json });
    });

  admin
    .command("impersonate-stop")
    .description("Stop the current impersonation")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const body = unwrap(await postImpersonateStop({}));
      print(body?.data ?? { ok: true }, { json: opts.json });
    });

  const resources: AdminResource[] = [
    {
      name: "workspaces",
      describe: "Tenants / workspaces",
      list: getWorkspaces,
      get: getWorkspacesId,
      create: postWorkspaces,
      update: patchWorkspacesId,
      actions: [
        {
          name: "suspend",
          describe: "Suspend a workspace",
          fn: postWorkspacesIdSuspend,
          confirm: true,
        },
        {
          name: "restore",
          describe: "Restore a suspended workspace",
          fn: postWorkspacesIdRestore,
        },
        {
          // Assisted sale: activates a tier without going through Stripe
          // self-service. If the tenant had a Stripe subscription it is
          // cancelled there first; a failure there aborts with 409.
          name: "plan",
          describe:
            'Assign a platform plan manually (--data \'{"planSlug":"spark|star|icon|legend"}\')',
          fn: postWorkspacesIdPlan,
          body: true,
          confirm: true,
        },
      ],
      columns: ["id", "name", "type", "country", "suspended", "createdAt"],
      listFlags: [
        { flag: "--status <s>", describe: "filter by status", query: "status" },
        { flag: "--q <text>", describe: "search by name/slug", query: "q" },
      ],
    },
    {
      name: "users",
      describe: "Global users (cross-tenant)",
      list: getUsers,
      get: getUsersId,
      update: patchUsersId,
      columns: ["id", "name", "email", "role", "banned", "createdAt"],
      listFlags: [
        { flag: "--q <text>", describe: "search by name/email", query: "q" },
        { flag: "--role <r>", describe: "filter by role", query: "role" },
        {
          flag: "--workspace <id>",
          describe: "filter by workspace",
          query: "workspaceId",
        },
      ],
    },
    {
      name: "plans",
      describe: "Platform plans",
      list: getPlatformPlans,
      get: getPlatformPlansId,
      create: postPlatformPlans,
      update: patchPlatformPlansId,
      columns: ["id", "name", "price", "currency", "interval"],
    },
    {
      name: "feature-flags",
      describe: "Feature flags",
      list: getFeatureFlags,
      actions: [
        {
          name: "set",
          describe: 'Set a flag (--data \'{"scope":"...","enabled":true}\')',
          fn: putFeatureFlagsKey,
          body: true,
          param: "key",
        },
      ],
      columns: ["key", "enabled", "description"],
      noPaging: true,
    },
    {
      // Platform service tokens (PAT): headless credential for `ft admin` in
      // CI, minted from an interactive SUPER_ADMIN session. The plaintext is
      // only ever returned by `create` — store it right away.
      name: "tokens",
      describe: "Platform service tokens (PAT)",
      list: getTokens,
      create: postTokens,
      actions: [
        {
          name: "revoke",
          describe: "Revoke a service token",
          fn: deleteTokensId,
          confirm: true,
        },
      ],
      columns: ["id", "name", "lastUsedAt", "expiresAt", "createdAt"],
      noPaging: true,
    },
    {
      name: "audit-log",
      describe: "Superadmin audit log",
      list: getAuditLog,
      columns: ["id", "actorId", "action", "targetType", "createdAt"],
      listFlags: [
        { flag: "--actor <id>", describe: "filter by actor", query: "actorId" },
        { flag: "--action <a>", describe: "filter by action", query: "action" },
        { flag: "--from <date>", describe: "from (ISO 8601)", query: "from" },
        { flag: "--to <date>", describe: "to (ISO 8601)", query: "to" },
      ],
    },
  ];

  for (const spec of resources) registerAdminResource(admin, spec);
}

function registerAdminResource(parent: Command, spec: AdminResource): void {
  const root = parent.command(spec.name).description(spec.describe);
  const singular = spec.name.replace(/s$/, "");

  if (spec.list) {
    const list = spec.list;
    const cmd = root.command("list").description(`List ${spec.name}`);
    if (!spec.noPaging) {
      cmd
        .option("--limit <n>", "results per page (1-100)", "20")
        .option("--cursor <id>", "pagination cursor");
    }
    for (const f of spec.listFlags ?? []) cmd.option(f.flag, f.describe);
    // Parity with `registerResource` (issue #39): these existed for the B2B
    // commands and not here, so the same flag worked or not depending on which
    // family you were in. No --workspace hint on empty results: the superadmin
    // surface is cross-tenant, there is no active workspace to name.
    cmd.option("--columns <list>", "comma-separated columns to display");
    cmd.option("--full", "show every field instead of the curated columns");
    cmd.option("--all", "auto-paginate: fetch every page (ignores --cursor)");
    cmd.option("--csv", "CSV output");
    cmd.option("--json", "raw JSON output");
    cmd.option("--raw", "raw JSON output including pagination metadata (page)");
    cmd.action(async (opts) => {
      configureAdminClient();
      const query: Record<string, unknown> = {};
      if (!spec.noPaging) {
        query.limit = Number(opts.limit);
        query.cursor = opts.cursor;
      }
      for (const f of spec.listFlags ?? []) {
        const v = opts[camel(f.query)];
        if (v !== undefined) query[f.query] = v;
      }
      const columns = resolveColumns(opts, spec.columns);

      if (opts.all && !spec.noPaging) {
        const rows: unknown[] = [];
        let cursor: string | undefined;
        let page: { nextCursor?: string | null; hasMore?: boolean } | undefined;
        do {
          const body = unwrap(await list({ query: { ...query, cursor } }));
          rows.push(...(body.data ?? []));
          page = body.page;
          cursor = page?.nextCursor ?? undefined;
        } while (page?.hasMore && cursor);
        if (opts.csv) {
          process.stdout.write(`${toCsv(rows, columns)}\n`);
          return;
        }
        print(rows, {
          json: opts.json,
          columns,
          columnsExplicit: Boolean(opts.columns),
        });
        return;
      }

      const body = unwrap(await list({ query }));
      if (opts.raw) {
        print(body, { json: true });
        return;
      }
      if (opts.csv) {
        process.stdout.write(`${toCsv(body.data, columns)}\n`);
        return;
      }
      print(body.data, {
        json: opts.json,
        columns,
        columnsExplicit: Boolean(opts.columns),
      });
      if (!opts.json && !spec.noPaging) printNextCursor(body.page);
    });
  }

  if (spec.get) {
    const get = spec.get;
    root
      .command("get <id>")
      .description(`Get one ${singular} by id`)
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureAdminClient();
        const body = unwrap(await get({ path: { id } }));
        print(body.data, { json: opts.json });
      });
  }

  if (spec.create) {
    const create = spec.create;
    root
      .command("create")
      .description(`Create a ${singular}`)
      .requiredOption("--data <json>", "JSON body (inline or @file.json)")
      .option("--json", "raw JSON output")
      .action(async (opts) => {
        configureAdminClient();
        const body = unwrap(await create({ body: parseData(opts.data) }));
        print(body?.data ?? body, { json: opts.json });
      });
  }

  if (spec.update) {
    const update = spec.update;
    root
      .command("update <id>")
      .description(`Update a ${singular} by id`)
      .requiredOption("--data <json>", "JSON body (inline or @file.json)")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureAdminClient();
        const body = unwrap(
          await update({ path: { id }, body: parseData(opts.data) }),
        );
        print(body?.data ?? body, { json: opts.json });
      });
  }

  for (const action of spec.actions ?? []) {
    const param = action.param ?? "id";
    const cmd = root
      .command(`${action.name} <${param}>`)
      .description(action.describe)
      .option("--yes", "skip confirmation")
      .option("--json", "raw JSON output");
    if (action.body) {
      cmd.option("--data <json>", "JSON body (inline or @file.json)");
    }
    cmd.action(async (value, opts) => {
      if (action.confirm) {
        await confirmOrExit(`${action.name} ${singular} ${value}?`, opts.yes);
      }
      configureAdminClient();
      const payload: Record<string, unknown> = { path: { [param]: value } };
      if (action.body && opts.data) payload.body = parseData(opts.data);
      const body = unwrap(await action.fn(payload));
      print(body?.data ?? body ?? { ok: true }, { json: opts.json });
    });
  }
}

function camel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
