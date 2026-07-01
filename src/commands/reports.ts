import type { Command } from "commander";
import {
  getReportsByEvent,
  getReportsExportsAttendees,
  getReportsExportsBuyers,
  getReportsExportsReconciliation,
  getReportsExportsSubscribers,
  getReportsInventory,
  getReportsReconciliation,
  getReportsSummary,
  getReportsTimeseries,
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

  root
    .command("by-event")
    .description("Revenue / tickets sold / availability grouped by event")
    .option("--from <date>", "created from (ISO 8601)")
    .option("--to <date>", "created to (ISO 8601)")
    .option("--status <s>", "filter by sale status")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsByEvent({
          query: { from: opts.from, to: opts.to, status: opts.status },
        }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("timeseries")
    .description("Revenue / tickets sold bucketed over time")
    .requiredOption("--interval <i>", "day | week | month")
    .option("--from <date>", "created from (ISO 8601)")
    .option("--to <date>", "created to (ISO 8601)")
    .option("--event <id>", "filter by event")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsTimeseries({
          query: {
            interval: opts.interval,
            from: opts.from,
            to: opts.to,
            event: opts.event,
          },
        }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("inventory")
    .description("Capacity / sold / reserved / available per event·date·type")
    .option("--event-id <id>", "filter by event")
    .option("--event-date-id <id>", "filter by event date")
    .option("--from <date>", "date from (ISO 8601)")
    .option("--to <date>", "date to (ISO 8601)")
    .option("--include-drafts", "include draft events")
    .option("--group-by <g>", "ticketType | date | event")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsInventory({
          query: {
            eventId: opts.eventId,
            eventDateId: opts.eventDateId,
            from: opts.from,
            to: opts.to,
            includeDrafts: opts.includeDrafts,
            groupBy: opts.groupBy,
          },
        }),
      );
      print(body.data, { json: opts.json });
    });

  const exp = root
    .command("export")
    .description(
      "Export buyers, attendees, subscribers or reconciliation (CSV)",
    );

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

  // buyers = one row per sale, attendees = one row per ticket; both filterable.
  for (const [name, fn, label] of [
    ["buyers", getReportsExportsBuyers, "buyers (one row per sale)"],
    ["attendees", getReportsExportsAttendees, "attendees (one row per ticket)"],
  ] as const) {
    exp
      .command(name)
      .description(`Export ${label}`)
      .option("--event <id>", "filter by event")
      .option("--event-date <id>", "filter by event date")
      .option("--from <date>", "created from (ISO 8601)")
      .option("--to <date>", "created to (ISO 8601)")
      .option("--status <s>", "filter by sale status")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (opts) => {
        configureClient(opts.workspace);
        const body = unwrap(
          await fn({
            query: {
              event: opts.event,
              eventDate: opts.eventDate,
              from: opts.from,
              to: opts.to,
              status: opts.status,
            },
          }),
        );
        print(body.data ?? body, { json: opts.json });
      });
  }

  exp
    .command("subscribers")
    .description("Export subscribers")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(await getReportsExportsSubscribers({}));
      print(body.data ?? body, { json: opts.json });
    });
}
