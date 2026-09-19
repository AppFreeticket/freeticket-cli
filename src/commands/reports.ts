import type { Command } from "commander";
import {
  getReportsByEvent,
  getReportsExportsAttendees,
  getReportsExportsBuyers,
  getReportsExportsReconciliation,
  getReportsExportsSubscribers,
  getReportsFinancials,
  getReportsInventory,
  getReportsReconciliation,
  getReportsSummary,
  getReportsTimeseries,
} from "../client/sdk.gen";
import {
  configureClient,
  describeError,
  listTargets,
  unwrap,
} from "../lib/api";
import { print, toCsv } from "../lib/output";

/**
 * Runs a row-shaped report against every workspace the session reads and
 * concatenates the rows, each tagged with where it came from. Same rule as the
 * resource lists: an unpinned account sees all of its workspaces, `--workspace`
 * (or `ft workspace use`) narrows it back to one.
 *
 * `reports summary` deliberately does not use this: KPIs are an object, and
 * adding them up across tenants means nothing.
 */
async function reportRows<T>(
  workspaceFlag: string | undefined,
  call: () => Promise<{ data?: { data: T[] }; error?: unknown }>,
): Promise<unknown> {
  const targets = await listTargets(workspaceFlag);
  if (!targets) {
    const res = await call();
    return (unwrap(res as never) as { data: T[] }).data;
  }
  const rows: unknown[] = [];
  for (const ws of targets) {
    configureClient(ws.id);
    const res = await call();
    if (res.error !== undefined) {
      // One workspace failing does not cost you the rest of the report.
      console.error(`(${ws.name}: ${describeError(res)})`);
      continue;
    }
    for (const row of res.data?.data ?? [])
      rows.push({ workspaceId: ws.id, workspaceName: ws.name, ...row });
  }
  return rows;
}

export function registerReports(program: Command): void {
  const root = program.command("reports").description("KPIs and exports");

  root
    .command("summary")
    .description("Workspace KPI summary")
    .option("--period <p>", "7d | 30d | 90d | 1y", "30d")
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getReportsSummary({ query: { period: opts.period } }),
      );
      printExport(body.data, opts);
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
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const rows = await reportRows(opts.workspace, () =>
        getReportsReconciliation({
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
      printExport(rows, opts);
    });

  root
    .command("financials")
    .description(
      "Per-function P&L: gross, platform fee, facial, payment fee, 4x1000, net to settle",
    )
    .option("--event <id>", "filter by event")
    .option("--past", "only functions that already happened (settleable)")
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const rows = await reportRows(opts.workspace, () =>
        getReportsFinancials({
          query: {
            event: opts.event,
            past:
              opts.past === undefined
                ? undefined
                : opts.past
                  ? "true"
                  : "false",
          },
        }),
      );
      printExport(rows, opts);
    });

  root
    .command("by-event")
    .description("Revenue / tickets sold / availability grouped by event")
    .option("--from <date>", "created from (ISO 8601)")
    .option("--to <date>", "created to (ISO 8601)")
    .option("--status <s>", "filter by sale status")
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const rows = await reportRows(opts.workspace, () =>
        getReportsByEvent({
          query: { from: opts.from, to: opts.to, status: opts.status },
        }),
      );
      printExport(rows, opts);
    });

  root
    .command("timeseries")
    .description("Revenue / tickets sold bucketed over time")
    .requiredOption("--interval <i>", "day | week | month")
    .option("--from <date>", "created from (ISO 8601)")
    .option("--to <date>", "created to (ISO 8601)")
    .option("--event <id>", "filter by event")
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const rows = await reportRows(opts.workspace, () =>
        getReportsTimeseries({
          query: {
            interval: opts.interval,
            from: opts.from,
            to: opts.to,
            event: opts.event,
          },
        }),
      );
      printExport(rows, opts);
    });

  root
    .command("inventory")
    .description("Capacity / sold / reserved / available per event·date·type")
    // The contract spells these `eventId`/`eventDateId` here but `event`/
    // `eventDate` on /sales and /discounts, so the flag that works everywhere
    // else fails exactly here (issue #41). Both spellings are accepted until
    // the contract normalizes (free-admin#357); `--event` is the canonical one.
    .option("--event <id>", "filter by event")
    .option("--event-date <id>", "filter by event date")
    .option("--event-id <id>", "alias of --event")
    .option("--event-date-id <id>", "alias of --event-date")
    .option("--from <date>", "date from (ISO 8601)")
    .option("--to <date>", "date to (ISO 8601)")
    .option("--include-drafts", "include draft events")
    .option("--group-by <g>", "ticketType | date | event")
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const rows = await reportRows(opts.workspace, () =>
        getReportsInventory({
          query: {
            eventId: opts.event ?? opts.eventId,
            eventDateId: opts.eventDate ?? opts.eventDateId,
            from: opts.from,
            to: opts.to,
            includeDrafts: opts.includeDrafts,
            groupBy: opts.groupBy,
          },
        }),
      );
      printExport(rows, opts);
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
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
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
      printExport(body.data ?? body, opts);
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
      .option(
        "--workspace <id>",
        "read only this workspace (default: all you can access)",
      )
      .option("--json", "raw JSON output")
      .option("--csv", "CSV output (for spreadsheets/accounting)")
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
        printExport(body.data ?? body, opts);
      });
  }

  exp
    .command("subscribers")
    .description("Export subscribers")
    .option(
      "--workspace <id>",
      "read only this workspace (default: all you can access)",
    )
    .option("--json", "raw JSON output")
    .option("--csv", "CSV output (for spreadsheets/accounting)")
    .action(async (opts) => {
      configureClient(opts.workspace);
      const body = unwrap(await getReportsExportsSubscribers({}));
      printExport(body.data ?? body, opts);
    });
}

/**
 * Exports promise "(CSV)". Two server shapes reach here:
 *  - `text/csv` → the payload is already a CSV string. Write it verbatim;
 *    running it through print()/JSON.stringify would quote the whole file and
 *    escape the newlines as literal `\n` (issue #22).
 *  - `application/json` → an array of rows: honor --csv, else JSON/table.
 */
export function printExport(
  rows: unknown,
  opts: { json?: boolean; csv?: boolean },
) {
  if (typeof rows === "string") {
    process.stdout.write(rows.endsWith("\n") ? rows : `${rows}\n`);
    return;
  }
  if (opts.csv && Array.isArray(rows)) {
    process.stdout.write(`${toCsv(rows)}\n`);
    return;
  }
  print(rows, { json: opts.json });
}
