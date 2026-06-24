import type { Command } from "commander";
import {
  getReportsExportsBuyers,
  getReportsExportsSubscribers,
  getReportsSummary,
} from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { print } from "../lib/output";

export function registerReports(program: Command): void {
  const root = program.command("reports").description("KPIs y exportaciones");

  root
    .command("summary")
    .description("Resumen de KPIs del workspace")
    .option("--period <p>", "7d | 30d | 90d | 1y", "30d")
    .option("--workspace <id>", "override del workspace")
    .option("--json", "salida JSON cruda")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsSummary({ query: { period: opts.period } }),
      );
      print(body.data, { json: opts.json });
    });

  const exp = root
    .command("export")
    .description("Exporta compradores o suscriptores (CSV)");

  for (const [name, fn, label] of [
    ["buyers", getReportsExportsBuyers, "compradores"],
    ["subscribers", getReportsExportsSubscribers, "suscriptores"],
  ] as const) {
    exp
      .command(name)
      .description(`Exporta ${label}`)
      .option("--workspace <id>", "override del workspace")
      .option("--json", "salida JSON cruda")
      .action(async (opts) => {
        configureClient(opts.workspace);
        const body = unwrap(await fn({}));
        print(body.data ?? body, { json: opts.json });
      });
  }
}
