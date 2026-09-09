import { Command } from "commander";
// Version synced with package.json at build time (tsup injects it via import).
import pkg from "../package.json" with { type: "json" };
import {
  deleteDiscountsId,
  deleteEventsId,
  deleteEventsIdDatesDateId,
  deleteMembershipPlansId,
  deleteTicketTypesId,
  deleteVenuesId,
  deleteWebhooksId,
  getDiscounts,
  getEvents,
  getEventsId,
  getEventsIdDates,
  getMembershipPlans,
  getMembershipPlansId,
  getMembershipPlansIdSubscribers,
  getSales,
  getSalesId,
  getSalesIdTickets,
  getSettlements,
  getStaff,
  getTicketTypes,
  getTicketTypesId,
  getVenues,
  getVenuesId,
  getWebhooks,
  patchDiscountsId,
  patchEventsId,
  patchEventsIdDatesDateId,
  patchMembershipPlansId,
  patchStaffIdRole,
  patchTicketTypesId,
  patchVenuesId,
  postDiscounts,
  postEvents,
  postEventsIdDates,
  postEventsIdPublish,
  postMembershipPlans,
  postSales,
  postSalesIdCancel,
  postSalesIdRefund,
  postStaff,
  postSubscriptionsIdCancel,
  postTicketTypes,
  postVenues,
  postWebhooks,
} from "./client/sdk.gen";
import { registerAdmin } from "./commands/admin";
import { registerApiKeys } from "./commands/api-keys";
import { registerAuth } from "./commands/auth";
import { registerEventDates } from "./commands/event-dates";
import { registerReports } from "./commands/reports";
import { registerResource } from "./commands/resource";
import { registerTickets } from "./commands/tickets";
import { registerWorkspace } from "./commands/workspace";
import { configureClient, signedDownload } from "./lib/api";
import { banner } from "./lib/banner";
import { print } from "./lib/output";
import { notifyUpdate } from "./lib/update-check";

const program = new Command();

program
  .name("ft")
  .description("Official FreeTicket CLI")
  .version(pkg.version, "-v, --version")
  .addHelpText("beforeAll", banner());

registerAuth(program);
registerWorkspace(program);

registerResource(program, {
  name: "events",
  describe: "Events",
  list: getEvents,
  get: getEventsId,
  create: postEvents,
  update: patchEventsId,
  del: deleteEventsId,
  actions: [
    { name: "publish", describe: "Publish an event", fn: postEventsIdPublish },
  ],
  // startsAt lives on EventDate, not Event — use createdAt for a temporal column.
  columns: ["id", "name", "status", "createdAt"],
  listFlags: [
    { flag: "--q <text>", describe: "search by name", query: "q" },
    {
      flag: "--status <s>",
      describe: "DRAFT | PUBLISHED | SOLD_OUT | CANCELLED | COMPLETED",
      query: "status",
    },
    {
      flag: "--with-total",
      describe: "include page.total (opt-in: costs an extra count query)",
      query: "withTotal",
    },
  ],
});

// Read-only: settlements are created by FreeTicket, never by the organizer.
// The PDF and the payment proofs download through `ft settlements document`
// (contract 1.7.0): the API answers 302 with a 5-minute signed URL.
registerResource(program, {
  name: "settlements",
  describe: "Settlements paid to the organizer",
  list: getSettlements,
  columns: ["id", "reference", "status", "amount", "currency", "createdAt"],
  listFlags: [
    { flag: "--event <id>", describe: "filter by event", query: "event" },
    {
      flag: "--status <s>",
      describe: "SENT | AWAITING_PAYMENT | PAID",
      query: "status",
    },
  ],
  extend: (root) => {
    root
      .command("document <id>")
      .description("Signed download URL for the settlement PDF (5 min TTL)")
      .option("--proof <fileName>", "download a payment proof instead")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (id, opts) => {
        configureClient(opts.workspace);
        const path = opts.proof
          ? `/settlements/${id}/proofs/${encodeURIComponent(opts.proof)}`
          : `/settlements/${id}/document`;
        print(await signedDownload(path), { json: opts.json });
      });
  },
});

registerEventDates(program, {
  list: getEventsIdDates,
  create: postEventsIdDates,
  update: patchEventsIdDatesDateId,
  del: deleteEventsIdDatesDateId,
});

registerResource(program, {
  name: "sales",
  describe: "Sales",
  list: getSales,
  get: getSalesId,
  create: postSales,
  actions: [
    {
      name: "cancel",
      describe:
        "Cancel a sale (--data '{\"acknowledge_open_payment\":true}' if the payment is still open)",
      fn: postSalesIdCancel,
      body: true,
    },
    {
      name: "refund",
      describe: "Refund a sale (--data for partial amount)",
      fn: postSalesIdRefund,
      body: true,
    },
    {
      name: "tickets",
      describe: "List the individual tickets/attendees of a sale",
      fn: getSalesIdTickets,
    },
  ],
  columns: ["id", "reference", "status", "total", "currency", "createdAt"],
  listFlags: [
    { flag: "--status <s>", describe: "filter by status", query: "status" },
    {
      flag: "--channel <c>",
      describe: "filter by sales channel",
      query: "channel",
    },
    { flag: "--event <id>", describe: "filter by event", query: "event" },
    {
      flag: "--event-date <id>",
      describe: "filter by event date",
      query: "eventDate",
    },
    {
      flag: "--reference <ref>",
      describe: "filter by reference",
      query: "reference",
    },
    {
      flag: "--buyer <q>",
      describe: "filter by buyer name/email",
      query: "buyer",
    },
    {
      flag: "--from <date>",
      describe: "created from (ISO 8601)",
      query: "from",
    },
    { flag: "--to <date>", describe: "created to (ISO 8601)", query: "to" },
  ],
});

registerResource(program, {
  name: "ticket-types",
  describe: "Ticket types",
  list: getTicketTypes,
  get: getTicketTypesId,
  create: postTicketTypes,
  update: patchTicketTypesId,
  del: deleteTicketTypesId,
  columns: ["id", "name", "price", "currency", "capacity"],
  listFlags: [
    {
      flag: "--event-date-id <id>",
      describe: "filter by event date",
      query: "eventDateId",
    },
  ],
});

registerResource(program, {
  name: "plans",
  describe: "Membership plans",
  list: getMembershipPlans,
  get: getMembershipPlansId,
  create: postMembershipPlans,
  update: patchMembershipPlansId,
  del: deleteMembershipPlansId,
  actions: [
    {
      name: "subscribers",
      describe: "List the subscribers/members of a plan",
      fn: getMembershipPlansIdSubscribers,
    },
  ],
  columns: ["id", "name", "price", "currency", "billingCycle"],
});

registerResource(program, {
  name: "discounts",
  describe: "Discount codes / coupons",
  list: getDiscounts,
  create: postDiscounts,
  update: patchDiscountsId,
  del: deleteDiscountsId,
  columns: ["id", "code", "type", "value", "active", "uses", "maxUses"],
  listFlags: [
    { flag: "--event <id>", describe: "filter by event", query: "event" },
    {
      flag: "--active <bool>",
      describe: "filter by active (true/false)",
      query: "active",
    },
  ],
});

registerResource(program, {
  name: "webhooks",
  describe: "Webhook endpoints (HMAC-signed event delivery)",
  list: getWebhooks,
  create: postWebhooks,
  del: deleteWebhooksId,
  columns: ["id", "url", "events", "active", "createdAt"],
});

registerResource(program, {
  name: "subscriptions",
  describe: "Plan subscriptions",
  actions: [
    {
      name: "cancel",
      describe: "Cancel a subscription",
      fn: postSubscriptionsIdCancel,
    },
  ],
});

registerResource(program, {
  name: "venues",
  describe: "Venues",
  list: getVenues,
  get: getVenuesId,
  create: postVenues,
  update: patchVenuesId,
  del: deleteVenuesId,
  columns: ["id", "name", "city"],
});

registerResource(program, {
  name: "staff",
  describe: "Workspace staff",
  list: getStaff,
  create: postStaff,
  actions: [
    {
      name: "set-role",
      describe: 'Change a staff member\'s role (--data \'{"role":"..."}\')',
      fn: patchStaffIdRole,
      body: true,
    },
  ],
  columns: ["id", "name", "email", "role", "workspaceName"],
  listFlags: [
    {
      flag: "--workspace-ids <ids>",
      describe:
        "comma-separated workspace ids (max 25): staff of all of them in one call",
      query: "workspaceIds",
    },
  ],
});

registerTickets(program);
registerReports(program);
registerApiKeys(program);
registerAdmin(program);

// No arguments -> banner + help.
if (process.argv.length <= 2) {
  console.log(banner());
  program.outputHelp();
  process.exit(0);
}

program
  .parseAsync()
  // After the command runs, drop a one-line update notice on stderr (once/day,
  // TTY-only). Never blocks or fails the command.
  .then(() => notifyUpdate(pkg.version))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
