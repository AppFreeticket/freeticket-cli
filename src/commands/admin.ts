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
} from "../admin-client/sdk.gen";
import { configureAdminClient, unwrap } from "../lib/api";
import { print, printNextCursor } from "../lib/output";

type SdkFn = (
  opts: any,
) => Promise<{ data?: any; error?: unknown; response: Response }>;

interface AdminResource {
  name: string;
  describe: string;
  list?: SdkFn;
  get?: SdkFn;
  columns?: string[];
  /** Extra list flags -> query entries. */
  listFlags?: { flag: string; describe: string; query: string }[];
  /** This list endpoint has no cursor pagination (e.g. feature-flags). */
  noPaging?: boolean;
}

/**
 * Superadmin commands (`ft admin <resource>`) against the /api/admin contract.
 * Read-only first pass — writes (suspend/restore/patch, impersonate,
 * feature-flags put) come in a second pass behind confirmation.
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

  const resources: AdminResource[] = [
    {
      name: "workspaces",
      describe: "Tenants / workspaces",
      list: getWorkspaces,
      get: getWorkspacesId,
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
      columns: ["id", "name", "price", "currency", "interval"],
    },
    {
      name: "feature-flags",
      describe: "Feature flags",
      list: getFeatureFlags,
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

  if (spec.list) {
    const list = spec.list;
    const cmd = root.command("list").description(`List ${spec.name}`);
    if (!spec.noPaging) {
      cmd
        .option("--limit <n>", "results per page (1-100)", "20")
        .option("--cursor <id>", "pagination cursor");
    }
    for (const f of spec.listFlags ?? []) cmd.option(f.flag, f.describe);
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
      print(body.data, { json: opts.json, columns: spec.columns });
      if (!opts.json && !spec.noPaging) printNextCursor(body.page);
    });
  }

  if (spec.get) {
    const get = spec.get;
    root
      .command("get <id>")
      .description(`Get one ${spec.name.replace(/s$/, "")} by id`)
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureAdminClient();
        const body = unwrap(await get({ path: { id } }));
        print(body.data, { json: opts.json });
      });
  }
}

function camel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
