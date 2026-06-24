import { Command } from "commander";
// versión sincronizada con package.json en build (tsup la inyecta vía import).
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
  .description("CLI oficial de FreeTicket")
  .version(pkg.version, "-v, --version")
  .addHelpText("beforeAll", banner());

registerAuth(program);

registerResource(program, {
  name: "events",
  describe: "Eventos",
  list: getEvents,
  get: getEventsId,
  columns: ["id", "name", "status", "startsAt"],
});

registerResource(program, {
  name: "sales",
  describe: "Ventas",
  list: getSales,
  get: getSalesId,
  columns: ["id", "reference", "status", "total", "currency", "createdAt"],
  listFlags: [
    { flag: "--status <s>", describe: "filtra por estado", query: "status" },
  ],
});

registerResource(program, {
  name: "ticket-types",
  describe: "Tipos de ticket",
  list: getTicketTypes,
  get: getTicketTypesId,
  columns: ["id", "name", "price", "currency", "stock"],
  listFlags: [
    {
      flag: "--event-date-id <id>",
      describe: "filtra por fecha de evento",
      query: "eventDateId",
    },
  ],
});

registerResource(program, {
  name: "plans",
  describe: "Planes de membresía",
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
  describe: "Staff del workspace",
  list: getStaff,
  columns: ["id", "name", "email", "role"],
});

registerReports(program);

// Sin argumentos → banner + ayuda.
if (process.argv.length <= 2) {
  console.log(banner());
  program.outputHelp();
  process.exit(0);
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
