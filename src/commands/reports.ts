import type { Command } from "commander";
import {
  getReportsExportsAttendees,
  getReportsExportsBuyers,
  getReportsExportsSubscribers,
  getReportsInventory,
  getReportsSummary,
} from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { print } from "../lib/output";

// Drops undefined flags so only the filters the user passed hit the query string.
function query(pairs: Record<string, unknown>): Record<string, string> {
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(pairs))
    if (v !== undefined) q[k] = String(v);
  return q;
}

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
    .command("inventory")
    .description("Aggregate inventory (capacity/sold/reserved/available)")
    .option("--event <id>", "filter by event id")
    .option("--event-date <id>", "filter by event date id")
    .option("--from <iso>", "event date from (ISO 8601)")
    .option("--to <iso>", "event date to (ISO 8601)")
    .option("--include-drafts", "include unpublished events")
    .option("--group-by <g>", "ticketType (default) | date | event")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsInventory({
          query: query({
            eventId: opts.event,
            eventDateId: opts.eventDate,
            from: opts.from,
            to: opts.to,
            includeDrafts: opts.includeDrafts ? "true" : undefined,
            groupBy: opts.groupBy,
          }),
        }),
      );
      print(body.data, {
        json: opts.json,
        columns: [
          "eventName",
          "startsAt",
          "ticketTypeName",
          "capacity",
          "sold",
          "reserved",
          "available",
        ],
      });
    });

  const exp = root
    .command("export")
    .description("Export buyers, attendees or subscribers");

  // buyers (one row per sale) and attendees (one row per ticket) share filters.
  for (const [name, fn, describe] of [
    ["buyers", getReportsExportsBuyers, "Export buyers (one row per sale)"],
    [
      "attendees",
      getReportsExportsAttendees,
      "Export attendees (one row per ticket)",
    ],
  ] as const) {
    exp
      .command(name)
      .description(describe)
      .option("--status <s>", "sale status (default CONFIRMED)")
      .option("--event <id>", "filter by event id")
      .option("--event-date <id>", "filter by event date id")
      .option("--from <iso>", "created from (ISO 8601)")
      .option("--to <iso>", "created to (ISO 8601)")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (opts) => {
        configureClient(opts.workspace);
        const body = unwrap(
          await fn({
            query: query({
              status: opts.status,
              event: opts.event,
              eventDate: opts.eventDate,
              from: opts.from,
              to: opts.to,
            }),
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
