import type { Command } from "commander";
import {
  getReportsExportsBuyers,
  getReportsExportsSubscribers,
  getReportsSummary,
} from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { print } from "../lib/output";

export function registerReports(program: Command): void {
  const root = program.command("reports").description("KPIs and exports");

  root
    .command("summary")
    .description("Workspace KPI summary")
    .option("--period <p>", "7d | 30d | 90d | 1y", "30d")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsSummary({ query: { period: opts.period } }),
      );
      print(body.data, { json: opts.json });
    });

  const exp = root
    .command("export")
    .description("Export buyers or subscribers (CSV)");

  for (const [name, fn, label] of [
    ["buyers", getReportsExportsBuyers, "buyers"],
    ["subscribers", getReportsExportsSubscribers, "subscribers"],
  ] as const) {
    exp
      .command(name)
      .description(`Export ${label}`)
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (opts) => {
        configureClient(opts.workspace);
        const body = unwrap(await fn({}));
        print(body.data ?? body, { json: opts.json });
      });
  }
}
