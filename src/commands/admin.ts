// biome-ignore-all lint/suspicious/noExplicitAny: generated SDK boundary — signatures vary by resource.
import type { Command } from "commander";
import {
  getAuditLog,
  getFeatureFlags,
  getMe,
  getPlatformPlans,
  getPlatformPlansId,
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
  postWorkspaces,
  postWorkspacesIdRestore,
  postWorkspacesIdSuspend,
  putFeatureFlagsKey,
} from "../admin-client/sdk.gen";
import { configureAdminClient, unwrap } from "../lib/api";
import { confirm, parseData } from "../lib/input";
import { print, printNextCursor, toCsv } from "../lib/output";

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
    .description("Superadmin (cross-tenant) — requires FT_ADMIN_SESSION");

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
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const body = unwrap(
        await postImpersonate({ body: parseData(opts.data) as never }),
      );
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
    cmd.option("--csv", "CSV output");
    cmd.option("--json", "raw JSON output");
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
      const body = unwrap(await list({ query }));
      if (opts.csv) {
        process.stdout.write(`${toCsv(body.data, spec.columns)}\n`);
        return;
      }
      print(body.data, { json: opts.json, columns: spec.columns });
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
      if (
        action.confirm &&
        !opts.yes &&
        !(await confirm(`${action.name} ${singular} ${value}?`))
      ) {
        console.error("Aborted.");
        return;
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
