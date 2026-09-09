import chalk from "chalk";
import Table from "cli-table3";
import { loadConfig } from "./config";

interface PrintOpts {
  json?: boolean;
  /** Columns to show in table mode (order). Inferred from the first object if omitted. */
  columns?: string[];
  /**
   * The user typed `--columns` explicitly, so honor it in JSON mode too.
   * Without this, `--columns id,name --json` silently dumped every field:
   * `--columns` worked for tables and CSV but not for the one output format an
   * agent actually reads. The curated default stays out of JSON on purpose —
   * trimming it silently would break `| jq` pipelines that expect whole rows.
   */
  columnsExplicit?: boolean;
}

/**
 * Prints `data`. With `--json`, dumps raw JSON. If it is an array of flat
 * objects, draws a table; anything else is printed as JSON.
 */
export function print(data: unknown, opts: PrintOpts = {}): void {
  if (opts.json) {
    const out =
      opts.columnsExplicit && opts.columns && Array.isArray(data)
        ? (data as Record<string, unknown>[]).map((row) =>
            pick(row, opts.columns as string[]),
          )
        : data;
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return;
  }
  if (Array.isArray(data) && data.every(isPlainRow)) {
    if (data.length === 0) {
      console.log(chalk.dim("(no results)"));
      return;
    }
    const cols = opts.columns ?? Object.keys(data[0] as object);
    const table = new Table({ head: cols.map((c) => chalk.hex("#07C2BA")(c)) });
    for (const row of data as Record<string, unknown>[]) {
      table.push(cols.map((c) => fmt(row[c])));
    }
    console.log(table.toString());
    return;
  }
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function csvEsc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Serializes an array of flat rows to CSV (RFC 4180 quoting). Columns default
 * to the first row's keys. Objects/arrays in cells are JSON-stringified.
 * When there are no rows but the caller knows the columns, we still emit the
 * header line so the CSV keeps its schema (useful for spreadsheets/pipelines).
 */
export function toCsv(rows: unknown, columns?: string[]): string {
  if (!Array.isArray(rows) || rows.length === 0) {
    return columns?.length ? columns.map(csvEsc).join(",") : "";
  }
  const cols = columns ?? Object.keys(rows[0] as object);
  const head = cols.map(csvEsc).join(",");
  const body = (rows as Record<string, unknown>[]).map((r) =>
    cols.map((c) => csvEsc(r[c])).join(","),
  );
  return [head, ...body].join("\n");
}

/**
 * Resolves which columns to render for a list command.
 * `--full` shows every field (inferred from the row); `--columns a,b,c` picks
 * an explicit set; otherwise the resource's curated default is used.
 */
export function resolveColumns(
  opts: { columns?: string; full?: boolean },
  fallback?: string[],
): string[] | undefined {
  if (opts.full) return undefined;
  if (opts.columns) {
    return opts.columns
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }
  return fallback;
}

/** Pagination hint on stderr to avoid contaminating `--json` output. */
export function printNextCursor(page?: { nextCursor?: string | null }): void {
  if (page?.nextCursor) {
    console.error(chalk.dim(`\nMore results: --cursor ${page.nextCursor}`));
  }
}

function isPlainRow(v: unknown): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return chalk.dim("—");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function pick(
  row: Record<string, unknown>,
  columns: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of columns) if (c in row) out[c] = row[c];
  return out;
}

/**
 * An empty list does not say why it is empty. For a human that is fine - they
 * know which workspace they are in. For an agent it is a silent dead end: the
 * response is syntactically valid and semantically mute, and it costs calls to
 * recover from (free-admin#674). Naming the scope is the missing half.
 * Goes to stderr so `--json` and `--csv` stay pipeable.
 */
export function printEmptyScope(workspaceFlag?: string): void {
  // Resolved here rather than by each caller: three command families need this
  // and the copy in resource.ts is exactly the duplication that let api-keys
  // and admin miss the fix (issue #39). The flag wins, then the stored session;
  // undefined means the API picked the default and naming it would cost a /me.
  const workspaceId = workspaceFlag ?? loadConfig().workspaceId;
  console.error(
    chalk.dim(
      workspaceId
        ? `(0 results in workspace ${workspaceId})`
        : "(0 results in the session's active workspace - check it with `ft whoami`, or scope with --workspace <id>)",
    ),
  );
}
