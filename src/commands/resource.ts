// biome-ignore-all lint/suspicious/noExplicitAny: generated SDK boundary — signatures vary by resource.
import type { Command } from "commander";
import { configureClient, unwrap } from "../lib/api";
import { print, printNextCursor } from "../lib/output";

type SdkFn = (
  opts: any,
) => Promise<{ data?: any; error?: unknown; response: Response }>;

interface ResourceSpec {
  name: string;
  describe: string;
  /** SDK function for paginated lists (query: limit, cursor, ...). */
  list?: SdkFn;
  /** SDK function for detail by id (path: { id }). */
  get?: SdkFn;
  /** Columns to show in list table output. */
  columns?: string[];
  /** Extra list flags -> query entries. Example: status, eventDateId. */
  listFlags?: { flag: string; describe: string; query: string }[];
}

/**
 * Registers a `<name> list|get` subcommand wired to the generated SDK.
 * All commands share --json and --workspace; list commands also get --limit/--cursor.
 */
export function registerResource(program: Command, spec: ResourceSpec): void {
  const root = program.command(spec.name).description(spec.describe);

  if (spec.list) {
    const list = spec.list;
    const cmd = root
      .command("list")
      .description(`List ${spec.name} from the active workspace`)
      .option("--limit <n>", "results per page (1-100)", "20")
      .option("--cursor <id>", "pagination cursor")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output");
    for (const f of spec.listFlags ?? []) cmd.option(f.flag, f.describe);
    cmd.action(async (opts) => {
      configureClient(opts.workspace);
      const query: Record<string, unknown> = {
        limit: Number(opts.limit),
        cursor: opts.cursor,
      };
      for (const f of spec.listFlags ?? []) {
        const v = opts[camel(f.query)];
        if (v !== undefined) query[f.query] = v;
      }
      const body = unwrap(await list({ query }));
      print(body.data, { json: opts.json, columns: spec.columns });
      if (!opts.json) printNextCursor(body.page);
    });
  }

  if (spec.get) {
    const get = spec.get;
    root
      .command("get <id>")
      .description(`Get one ${spec.name.replace(/s$/, "")} by id`)
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureClient(opts.workspace);
        const body = unwrap(await get({ path: { id } }));
        print(body.data, { json: opts.json });
      });
  }
}

function camel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
