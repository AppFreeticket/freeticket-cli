import type { Command } from "commander";
import {
  getTicketsTicketCodeAccess,
  postTicketsTicketCodeCheckin,
  postTicketsTicketCodeResend,
} from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { print } from "../lib/output";

/**
 * `ft tickets` — door/access operations keyed by ticket code (the QR payload),
 * not by numeric id. Kept separate from registerResource because the path
 * param is `ticketCode`.
 */
export function registerTickets(program: Command): void {
  const root = program
    .command("tickets")
    .description("Individual tickets: door check-in, access status, QR resend");

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
        await postTicketsTicketCodeCheckin({ path: { ticketCode: code } }),
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
}
