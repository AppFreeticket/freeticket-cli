// biome-ignore-all lint/suspicious/noExplicitAny: generated SDK boundary — signatures vary by resource.
import type { Command } from "commander";
import { configureClient, unwrap } from "../lib/api";
import { confirm, parseData } from "../lib/input";
import { print } from "../lib/output";

type SdkFn = (
  opts: any,
) => Promise<{ data?: any; error?: unknown; response: Response }>;

interface EventDatesSpec {
  /** GET /events/{id}/dates */
  list: SdkFn;
  /** POST /events/{id}/dates */
  create: SdkFn;
  /** PATCH /events/{id}/dates/{dateId} */
  update: SdkFn;
  /** DELETE /events/{id}/dates/{dateId} */
  del: SdkFn;
}

/**
 * `ft event-dates ...` — the nested /events/{id}/dates resource. Lives apart
 * from registerResource because its paths take two ids (event + date).
 */
export function registerEventDates(
  program: Command,
  spec: EventDatesSpec,
): void {
  const root = program
    .command("event-dates")
    .description("Event dates (sessions of an event)");

  root
    .command("list <eventId>")
    .description("List dates of an event")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(await spec.list({ path: { id: eventId } }));
      print(body.data ?? body, {
        json: opts.json,
        columns: ["id", "startsAt", "endsAt", "status"],
      });
    });

  root
    .command("create <eventId>")
    .description("Add a date to an event")
    .requiredOption("--data <json>", "JSON body (inline or @file.json)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await spec.create({
          path: { id: eventId },
          body: parseData(opts.data),
        }),
      );
      print(body.data ?? body, { json: opts.json });
    });

  root
    .command("update <eventId> <dateId>")
    .description("Update an event date")
    .requiredOption("--data <json>", "JSON body (inline or @file.json)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, dateId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await spec.update({
          path: { id: eventId, dateId },
          body: parseData(opts.data),
        }),
      );
      print(body.data ?? body, { json: opts.json });
    });

  root
    .command("delete <eventId> <dateId>")
    .description("Delete an event date")
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, dateId, opts) => {
      if (!opts.yes && !(await confirm(`Delete date ${dateId}?`))) {
        console.error("Aborted.");
        return;
      }
      configureClient(opts.workspace);
      const body = unwrap(await spec.del({ path: { id: eventId, dateId } }));
      print(body?.data ?? { deleted: dateId }, { json: opts.json });
    });
}
