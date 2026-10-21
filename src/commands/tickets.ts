import type { Command } from "commander";
import {
  getTicketsTicketCodeAccess,
  patchTicketsTicketCode,
  postTicketsTicketCodeCheckin,
  postTicketsTicketCodeResend,
} from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { parseData } from "../lib/input";
import { print } from "../lib/output";

/**
 * `ft tickets` — door/access operations keyed by ticket code (the QR payload),
 * not by numeric id. Kept separate from registerResource because the path
 * param is `ticketCode`.
 */
export function registerTickets(program: Command): void {
  const root = program
    .command("tickets")
    .description(
      "Individual tickets: door check-in, access status, QR resend, reassign",
    );

  root
    .command("access <code>")
    .description("Read a ticket's access status without admitting it")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (code, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getTicketsTicketCodeAccess({ path: { ticketCode: code } }),
      );
      print(body.data ?? body, { json: opts.json });
    });

  root
    .command("checkin <code>")
    .description(
      "Admit a ticket at the door (idempotent, prevents double entry)",
    )
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (code, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        // The contract marks the body required since 1.19 (optional `source`
        // of the scanned QR); the backend accepts it empty.
        await postTicketsTicketCodeCheckin({
          path: { ticketCode: code },
          body: {},
        }),
      );
      print(body.data ?? body, { json: opts.json });
    });

  root
    .command("resend <code>")
    .description("Resend the ticket's confirmation email (QR)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (code, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await postTicketsTicketCodeResend({ path: { ticketCode: code } }),
      );
      print(body.data ?? body, { json: opts.json });
    });

  // Postponements: move an already sold ticket to another date and/or ticket
  // type without refunding and reselling. With only eventDateId the backend
  // resolves the type by name on the new date (422 if ambiguous: pass
  // ticketTypeId). It does not charge or refund any price difference.
  root
    .command("reassign <code>")
    .description(
      'Move a sold ticket to another date/type (--data \'{"eventDateId":"…"}\' and/or "ticketTypeId", "seatLabel")',
    )
    .requiredOption("--data <json>", "JSON body (inline or @file.json)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (code, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await patchTicketsTicketCode({
          path: { ticketCode: code },
          body: parseData(opts.data) as never,
        }),
      );
      print(body.data ?? body, { json: opts.json });
    });
}
