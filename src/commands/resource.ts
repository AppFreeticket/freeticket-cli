// biome-ignore-all lint/suspicious/noExplicitAny: generated SDK boundary — signatures vary by resource.
import type { Command } from "commander";
import { configureClient, unwrap } from "../lib/api";
import { confirm, parseData } from "../lib/input";
import { print, printNextCursor, resolveColumns, toCsv } from "../lib/output";

type SdkFn = (
  opts: any,
) => Promise<{ data?: any; error?: unknown; response: Response }>;

/** A custom mutation bound to one resource id, e.g. `events publish <id>`. */
interface ActionSpec {
  name: string;
  describe: string;
  /** SDK function: receives { path: { id }, body? }. */
  fn: SdkFn;
  /** When true, the action accepts a `--data` JSON body (e.g. refund amount). */
  body?: boolean;
}

interface ResourceSpec {
  name: string;
  describe: string;
  /** SDK function for paginated lists (query: limit, cursor, ...). */
  list?: SdkFn;
  /** SDK function for detail by id (path: { id }). */
  get?: SdkFn;
  /** SDK function for create (body). */
  create?: SdkFn;
  /** SDK function for update by id (path: { id }, body). */
  update?: SdkFn;
  /** SDK function for delete by id (path: { id }). */
  del?: SdkFn;
  /** Custom id-bound actions (publish, cancel, refund, ...). */
  actions?: ActionSpec[];
  /** Columns to show in list table / CSV output. */
  columns?: string[];
  /** Extra list flags -> query entries. Example: status, eventDateId. */
  listFlags?: { flag: string; describe: string; query: string }[];
}

/**
 * Registers a `<name> list|get|create|update|delete|<action>` command group
 * wired to the generated SDK. All commands share --json and --workspace;
 * list also gets --limit/--cursor/--csv; mutations take --data (inline JSON
 * or @file); delete asks for confirmation unless --yes.
 */
export function registerResource(program: Command, spec: ResourceSpec): void {
  const root = program.command(spec.name).description(spec.describe);
  const singular = spec.name.replace(/s$/, "");

  if (spec.list) {
    const list = spec.list;
    const cmd = root
      .command("list")
      .description(`List ${spec.name} from the active workspace`)
      .option("--limit <n>", "results per page (1-100)", "20")
      .option("--cursor <id>", "pagination cursor")
      .option("--all", "auto-paginate: fetch every page (ignores --cursor)")
      .option("--columns <list>", "comma-separated columns to display")
      .option("--full", "show every field instead of the curated columns")
      .option("--workspace <id>", "workspace override")
      .option("--csv", "CSV output (for spreadsheets/accounting)")
      .option("--json", "raw JSON output (data only)")
      .option("--raw", "raw JSON output including pagination metadata (page)");
    for (const f of spec.listFlags ?? []) cmd.option(f.flag, f.describe);
    cmd.action(async (opts) => {
      configureClient(opts.workspace);
      const columns = resolveColumns(opts, spec.columns);
      const query: Record<string, unknown> = {
        limit: Number(opts.limit),
        cursor: opts.cursor,
      };
      for (const f of spec.listFlags ?? []) {
        const v = opts[camel(f.query)];
        if (v !== undefined) query[f.query] = v;
      }

      if (opts.all) {
        const rows: unknown[] = [];
        let cursor: string | undefined;
        let page: { nextCursor?: string | null; hasMore?: boolean } | undefined;
        do {
          const body = unwrap(await list({ query: { ...query, cursor } }));
          rows.push(...(body.data ?? []));
          page = body.page;
          cursor = page?.nextCursor ?? undefined;
        } while (page?.hasMore && cursor);
        if (opts.raw) {
          print(
            { data: rows, page: { nextCursor: null, hasMore: false } },
            { json: true },
          );
          return;
        }
        if (opts.csv) {
          process.stdout.write(`${toCsv(rows, columns)}\n`);
          return;
        }
        print(rows, { json: opts.json, columns });
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
      print(body.data, { json: opts.json, columns });
      if (!opts.json) printNextCursor(body.page);
    });
  }

  if (spec.get) {
    const get = spec.get;
    root
      .command("get <id>")
      .description(`Get one ${singular} by id`)
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureClient(opts.workspace);
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
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (opts) => {
        configureClient(opts.workspace);
        const body = unwrap(await create({ body: parseData(opts.data) }));
        print(body.data ?? body, { json: opts.json });
      });
  }

  if (spec.update) {
    const update = spec.update;
    root
      .command("update <id>")
      .description(`Update a ${singular} by id`)
      .requiredOption("--data <json>", "JSON body (inline or @file.json)")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureClient(opts.workspace);
        const body = unwrap(
          await update({ path: { id }, body: parseData(opts.data) }),
        );
        print(body.data ?? body, { json: opts.json });
      });
  }

  if (spec.del) {
    const del = spec.del;
    root
      .command("delete <id>")
      .description(`Delete a ${singular} by id`)
      .option("--yes", "skip confirmation")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        if (!opts.yes && !(await confirm(`Delete ${singular} ${id}?`))) {
          console.error("Aborted.");
          return;
        }
        configureClient(opts.workspace);
        const body = unwrap(await del({ path: { id } }));
        print(body?.data ?? { deleted: id }, { json: opts.json });
      });
  }

  for (const action of spec.actions ?? []) {
    const cmd = root
      .command(`${action.name} <id>`)
      .description(action.describe)
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output");
    if (action.body) {
      cmd.option("--data <json>", "JSON body (inline or @file.json)");
    }
    cmd.action(async (id, opts) => {
      configureClient(opts.workspace);
      const payload: Record<string, unknown> = { path: { id } };
      if (action.body && opts.data) payload.body = parseData(opts.data);
      const body = unwrap(await action.fn(payload));
      print(body?.data ?? body ?? { ok: true, id }, { json: opts.json });
    });
  }
}

function camel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
