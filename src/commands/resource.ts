// biome-ignore-all lint/suspicious/noExplicitAny: límite con el SDK generado — las firmas varían por recurso.
import type { Command } from "commander";
import { configureClient, unwrap } from "../lib/api";
import { print, printNextCursor } from "../lib/output";

type SdkFn = (
  opts: any,
) => Promise<{ data?: any; error?: unknown; response: Response }>;

interface ResourceSpec {
  name: string;
  describe: string;
  /** SDK fn de listado paginado (query: limit, cursor, …). */
  list?: SdkFn;
  /** SDK fn de detalle por id (path: { id }). */
  get?: SdkFn;
  /** Columnas a mostrar en la tabla del listado. */
  columns?: string[];
  /** Flags extra del listado → entradas de query. Ej: status, eventDateId. */
  listFlags?: { flag: string; describe: string; query: string }[];
}

/**
 * Registra un subcomando `<name> list|get` cableado al SDK generado.
 * Todos comparten --json y --workspace; los listados, --limit/--cursor.
 */
export function registerResource(program: Command, spec: ResourceSpec): void {
  const root = program.command(spec.name).description(spec.describe);

  if (spec.list) {
    const list = spec.list;
    const cmd = root
      .command("list")
      .description(`Lista ${spec.name} del workspace activo`)
      .option("--limit <n>", "resultados por página (1–100)", "20")
      .option("--cursor <id>", "cursor de paginación")
      .option("--workspace <id>", "override del workspace")
      .option("--json", "salida JSON cruda");
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
      .description(`Detalle de un ${spec.name.replace(/s$/, "")} por id`)
      .option("--workspace <id>", "override del workspace")
      .option("--json", "salida JSON cruda")
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
