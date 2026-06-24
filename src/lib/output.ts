import chalk from "chalk";
import Table from "cli-table3";

interface PrintOpts {
  json?: boolean;
  /** Columnas a mostrar en modo tabla (orden). Si se omite, se infieren del 1er objeto. */
  columns?: string[];
}

/**
 * Imprime `data`. Con `--json` vuelca el JSON crudo. Si es un array de objetos
 * planos, dibuja una tabla; cualquier otra cosa se imprime como JSON.
 */
export function print(data: unknown, opts: PrintOpts = {}): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }
  if (Array.isArray(data) && data.every(isPlainRow)) {
    if (data.length === 0) {
      console.log(chalk.dim("(sin resultados)"));
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

/** Pista de paginación en stderr para no contaminar la salida `--json`. */
export function printNextCursor(page?: { nextCursor?: string | null }): void {
  if (page?.nextCursor) {
    console.error(chalk.dim(`\nMás resultados: --cursor ${page.nextCursor}`));
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
