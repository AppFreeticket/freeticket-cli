import type { Command } from "commander";
import {
  getReportsExportsBuyers,
  getReportsExportsReconciliation,
  getReportsExportsSubscribers,
  getReportsReconciliation,
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

  root
    .command("reconciliation")
    .description("CFO reconciliation: Mercado Pago vs sale vs Siigo invoice")
    .requiredOption("--from <date>", "date_from (ISO 8601)")
    .requiredOption("--to <date>", "date_to (ISO 8601)")
    .option(
      "--match <status>",
      "OK | MISSING_INVOICE | MISSING_CUFE | AMOUNT_MISMATCH | MISSING_PAYMENT",
    )
    .option("--provider <p>", "filter by payment provider")
    .option("--page <n>", "page number")
    .option("--page-size <n>", "rows per page")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsReconciliation({
          query: {
            date_from: opts.from,
            date_to: opts.to,
            match_status: opts.match,
            provider: opts.provider,
            page: opts.page,
            page_size: opts.pageSize,
          },
        }),
      );
      print(body.data, { json: opts.json });
    });

  const exp = root
    .command("export")
    .description("Export buyers, subscribers or reconciliation (CSV)");

  exp
    .command("reconciliation")
    .description("Export reconciliation (CSV) for accounting")
    .requiredOption("--from <date>", "date_from (ISO 8601)")
    .requiredOption("--to <date>", "date_to (ISO 8601)")
    .option("--match <status>", "filter by match_status")
    .option("--provider <p>", "filter by payment provider")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsExportsReconciliation({
          query: {
            date_from: opts.from,
            date_to: opts.to,
            match_status: opts.match,
            provider: opts.provider,
          },
        }),
      );
      print(body.data ?? body, { json: opts.json });
    });

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
