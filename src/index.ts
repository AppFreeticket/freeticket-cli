import { Command } from "commander";
// Version synced with package.json at build time (tsup injects it via import).
import pkg from "../package.json" with { type: "json" };
import {
  getEvents,
  getEventsId,
  getMembershipPlans,
  getMembershipPlansId,
  getSales,
  getSalesId,
  getStaff,
  getTicketTypes,
  getTicketTypesId,
  getVenues,
  getVenuesId,
} from "./client/sdk.gen";
import { registerAuth } from "./commands/auth";
import { registerReports } from "./commands/reports";
import { registerResource } from "./commands/resource";
import { banner } from "./lib/banner";

const program = new Command();

program
  .name("ft")
  .description("Official FreeTicket CLI")
  .version(pkg.version, "-v, --version")
  .addHelpText("beforeAll", banner());

registerAuth(program);

registerResource(program, {
  name: "events",
  describe: "Events",
  list: getEvents,
  get: getEventsId,
  columns: ["id", "name", "status", "startsAt"],
});

registerResource(program, {
  name: "sales",
  describe: "Sales",
  list: getSales,
  get: getSalesId,
  columns: ["id", "reference", "status", "total", "currency", "createdAt"],
  listFlags: [
    { flag: "--status <s>", describe: "filter by status", query: "status" },
    {
      flag: "--channel <c>",
      describe: "WEB|MOBILE|POS|ADMIN",
      query: "channel",
    },
    { flag: "--event <id>", describe: "filter by event id", query: "event" },
    {
      flag: "--event-date <id>",
      describe: "filter by event date id",
      query: "eventDate",
    },
    {
      flag: "--reference <ref>",
      describe: "partial reference match",
      query: "reference",
    },
    {
      flag: "--buyer <q>",
      describe: "buyer name or email match",
      query: "buyer",
    },
    {
      flag: "--from <iso>",
      describe: "created from (ISO 8601)",
      query: "from",
    },
    { flag: "--to <iso>", describe: "created to (ISO 8601)", query: "to" },
  ],
});

registerResource(program, {
  name: "ticket-types",
  describe: "Ticket types",
  list: getTicketTypes,
  get: getTicketTypesId,
  columns: ["id", "name", "price", "currency", "stock"],
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
  columns: ["id", "name", "price", "currency", "interval"],
});

registerResource(program, {
  name: "venues",
  describe: "Venues",
  list: getVenues,
  get: getVenuesId,
  columns: ["id", "name", "city"],
});

registerResource(program, {
  name: "staff",
  describe: "Workspace staff",
  list: getStaff,
  columns: ["id", "name", "email", "role"],
});

registerReports(program);

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
