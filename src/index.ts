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
import { banner } from "./lib/banner";
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
    { name: "cancel", describe: "Cancel a sale", fn: postSalesIdCancel },
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
  columns: ["id", "name", "email", "role"],
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
