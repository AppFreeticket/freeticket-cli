import type { Command } from "commander";
import {
  deleteEventsIdSchedule,
  deletePresaleWindowsId,
  deleteTicketsTicketCodeCheckin,
  getEventDatesIdCourtesySeats,
  getTicketTypesIdPresaleWindows,
  patchPresaleWindowsId,
  patchSalesIdRecipient,
  postEventsIdSchedule,
  postSalesIdItemsItemIdTransfer,
  postTicketTypesIdPresaleWindows,
} from "../client/sdk.gen";
import { configureClient, fail, unwrap } from "../lib/api";
import { confirmOrExit } from "../lib/input";
import { print } from "../lib/output";

/**
 * Dashboard-parity operations from contract 1.25.0: scheduled publication,
 * presale windows, ticket transfer, check-in undo, courtesy recipient and
 * courtesy seats. Each hooks into the family it belongs to (`ft events`,
 * `ft sales`, `ft tickets`, `ft event-dates`) because their paths take
 * nested ids or no body that registerResource could model.
 */

const PRESALE_COLUMNS = [
  "id",
  "planId",
  "presaleStartsAt",
  "presaleEndsAt",
  "presaleCapacity",
  "isActive",
];

/** Presale window body from flags; only the flags passed are sent. */
function presaleBody(opts: Record<string, string | boolean | undefined>) {
  const body: Record<string, unknown> = {};
  if (opts.plan) body.planId = opts.plan;
  if (opts.startsAt) body.presaleStartsAt = opts.startsAt;
  if (opts.endsAt) body.presaleEndsAt = opts.endsAt;
  if (opts.capacity !== undefined)
    body.presaleCapacity =
      opts.capacity === "none" ? null : Number(opts.capacity);
  if (opts.active !== undefined) body.isActive = opts.active === "true";
  return body;
}

/** `ft events schedule set|clear <eventId>` */
export function registerEventSchedule(events: Command): void {
  const schedule = events
    .command("schedule")
    .description("Scheduled publication of a draft event");

  schedule
    .command("set <eventId>")
    .description(
      "Schedule a DRAFT: --publish-at publishes it later; --sale-starts-at publishes now and opens sales later (exactly one)",
    )
    .option("--publish-at <iso>", "publish automatically at this UTC instant")
    .option(
      "--sale-starts-at <iso>",
      "publish now; open sales on every upcoming ticket type at this UTC instant",
    )
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, opts) => {
      if (!opts.publishAt === !opts.saleStartsAt)
        fail("Pass exactly one of --publish-at or --sale-starts-at.");
      configureClient(opts.workspace);
      const body = unwrap(
        await postEventsIdSchedule({
          path: { id: eventId },
          body: opts.publishAt
            ? { publishAt: opts.publishAt }
            : { saleStartsAt: opts.saleStartsAt },
        }),
      );
      print(body.data, { json: opts.json });
    });

  schedule
    .command("clear <eventId>")
    .description(
      "Cancel a pending --publish-at (does not undo --sale-starts-at: edit the ticket types)",
    )
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await deleteEventsIdSchedule({ path: { id: eventId } }),
      );
      print(body.data, { json: opts.json });
    });
}

/** `ft presale-windows list|create|update|delete` (alias `presales`). */
export function registerPresaleWindows(program: Command): void {
  const root = program
    .command("presale-windows")
    .alias("presales")
    .description(
      "Membership presale windows on a ticket type (one window per plan)",
    );

  root
    .command("list <ticketTypeId>")
    .description("List a ticket type's presale windows")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (ticketTypeId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getTicketTypesIdPresaleWindows({ path: { id: ticketTypeId } }),
      );
      print(body.data, { json: opts.json, columns: PRESALE_COLUMNS });
    });

  root
    .command("create <ticketTypeId>")
    .description("Open a presale window for the members of one plan")
    .requiredOption("--plan <planId>", "membership plan of this workspace")
    .requiredOption("--starts-at <iso>", "presale start (UTC)")
    .requiredOption("--ends-at <iso>", "presale end (UTC, after start)")
    .option("--capacity <n>", "max tickets sold in the presale")
    .option("--active <bool>", "true | false (default true)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (ticketTypeId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await postTicketTypesIdPresaleWindows({
          path: { id: ticketTypeId },
          body: presaleBody(opts) as never,
        }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("update <windowId>")
    .description("Edit a presale window (only the flags passed change)")
    .option("--plan <planId>", "membership plan of this workspace")
    .option("--starts-at <iso>", "presale start (UTC)")
    .option("--ends-at <iso>", "presale end (UTC)")
    .option("--capacity <n>", 'max tickets, or "none" to remove the cap')
    .option("--active <bool>", "true | false")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (windowId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await patchPresaleWindowsId({
          path: { id: windowId },
          body: presaleBody(opts),
        }),
      );
      print(body.data, { json: opts.json });
    });

  root
    .command("delete <windowId>")
    .description("Delete a presale window (members lose that access now)")
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (windowId, opts) => {
      await confirmOrExit(`Delete presale window ${windowId}?`, opts.yes);
      configureClient(opts.workspace);
      const body = unwrap(
        await deletePresaleWindowsId({ path: { id: windowId } }),
      );
      print(body.data, { json: opts.json });
    });
}

/** `ft sales transfer` and `ft sales recipient set`. */
export function registerSaleOps(sales: Command): void {
  sales
    .command("transfer <saleId> <itemId>")
    .description(
      "Transfer one ticket to a registered buyer (voids the old QR; once per ticket, until the show starts)",
    )
    .requiredOption("--email <email>", "recipient's verified FreeTicket email")
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (saleId, itemId, opts) => {
      await confirmOrExit(
        `Transfer ticket ${itemId} of sale ${saleId} to ${opts.email}? The current QR stops working.`,
        opts.yes,
      );
      configureClient(opts.workspace);
      const body = unwrap(
        await postSalesIdItemsItemIdTransfer({
          path: { id: saleId, itemId },
          body: { email: opts.email },
        }),
      );
      print(body.data, { json: opts.json });
    });

  sales
    .command("recipient")
    .description("Recipient of a courtesy sale")
    .command("set <saleId>")
    .description(
      "Correct a courtesy's recipient and resend its tickets (a new email voids the old QRs)",
    )
    .requiredOption("--name <name>", "recipient name")
    .requiredOption("--email <email>", "recipient email")
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (saleId, opts) => {
      await confirmOrExit(
        `Set the recipient of courtesy ${saleId} to ${opts.name} <${opts.email}> and resend? If the email changes, the QRs already sent stop working.`,
        opts.yes,
      );
      configureClient(opts.workspace);
      const body = unwrap(
        await patchSalesIdRecipient({
          path: { id: saleId },
          body: { name: opts.name, email: opts.email },
        }),
      );
      print(body.data, { json: opts.json });
    });
}

/** `ft tickets checkin-undo <code>` */
export function registerCheckinUndo(tickets: Command): void {
  tickets
    .command("checkin-undo <code>")
    .description(
      "Undo a door check-in so the ticket is valid again (ADMIN; idempotent)",
    )
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (code, opts) => {
      await confirmOrExit(`Undo the check-in of ticket ${code}?`, opts.yes);
      configureClient(opts.workspace);
      const body = unwrap(
        await deleteTicketsTicketCodeCheckin({ path: { ticketCode: code } }),
      );
      print(body.data, { json: opts.json });
    });
}

/** `ft event-dates courtesy-seats <dateId>` */
export function registerCourtesySeats(eventDates: Command): void {
  eventDates
    .command("courtesy-seats <dateId>")
    .description(
      "Blocked seats of a numbered date that can be issued as courtesies",
    )
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (dateId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getEventDatesIdCourtesySeats({ path: { id: dateId } }),
      );
      print(opts.json ? body.data : body.data.ticketTypes, {
        json: opts.json,
        columns: ["ticketTypeId", "name", "labels"],
      });
    });
}
