import chalk from "chalk";
import Table from "cli-table3";

interface PrintOpts {
  json?: boolean;
  /** Columns to show in table mode (order). Inferred from the first object if omitted. */
  columns?: string[];
}

/**
 * Prints `data`. With `--json`, dumps raw JSON. If it is an array of flat
 * objects, draws a table; anything else is printed as JSON.
 */
export function print(data: unknown, opts: PrintOpts = {}): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
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
