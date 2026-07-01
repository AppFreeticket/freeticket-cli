import { Command } from "commander";
// Version synced with package.json at build time (tsup injects it via import).
import pkg from "../package.json" with { type: "json" };
import {
  deleteEventsId,
  deleteEventsIdDatesDateId,
  deleteMembershipPlansId,
  deleteTicketTypesId,
  deleteVenuesId,
  getEvents,
  getEventsId,
  getEventsIdDates,
  getMembershipPlans,
  getMembershipPlansId,
  getSales,
  getSalesId,
  getStaff,
  getTicketTypes,
  getTicketTypesId,
  getVenues,
  getVenuesId,
  patchEventsId,
  patchEventsIdDatesDateId,
  patchMembershipPlansId,
  patchStaffIdRole,
  patchTicketTypesId,
  patchVenuesId,
  postEvents,
  postEventsIdDates,
  postEventsIdPublish,
  postMembershipPlans,
  postSalesIdCancel,
  postSalesIdRefund,
  postStaff,
  postTicketTypes,
  postVenues,
} from "./client/sdk.gen";
import { registerAdmin } from "./commands/admin";
import { registerAuth } from "./commands/auth";
import { registerEventDates } from "./commands/event-dates";
import { registerReports } from "./commands/reports";
import { registerResource } from "./commands/resource";
import { registerWorkspace } from "./commands/workspace";
import { banner } from "./lib/banner";

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
  actions: [
    { name: "cancel", describe: "Cancel a sale", fn: postSalesIdCancel },
    {
      name: "refund",
      describe: "Refund a sale (--data for partial amount)",
      fn: postSalesIdRefund,
      body: true,
    },
  ],
  columns: ["id", "reference", "status", "total", "currency", "createdAt"],
  listFlags: [
    { flag: "--status <s>", describe: "filter by status", query: "status" },
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
  columns: ["id", "name", "price", "currency", "billingCycle"],
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

registerReports(program);
registerAdmin(program);

// No arguments -> banner + help.
if (process.argv.length <= 2) {
  console.log(banner());
  program.outputHelp();
  process.exit(0);
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
