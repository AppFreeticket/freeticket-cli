import { Command } from "commander";
// Version synced with package.json at build time (tsup injects it via import).
import pkg from "../package.json" with { type: "json" };
import {
  deleteDiscountsId,
  deleteEventsId,
  deleteEventsIdDatesDateId,
  deleteMembershipPlansId,
  deleteStaffId,
  deleteTicketTypesId,
  deleteVenuesId,
  deleteWebhooksId,
  getContentLives,
  getContentLivesId,
  getContentPosts,
  getContentVideos,
  getDiscounts,
  getEvents,
  getEventsId,
  getEventsIdDates,
  getMembershipPlans,
  getMembershipPlansId,
  getMembershipPlansIdSubscribers,
  getSales,
  getSalesId,
  getSalesIdAttempts,
  getSalesIdTickets,
  getSettlements,
  getSettlementsId,
  getStaff,
  getStaffId,
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
  patchWebhooksId,
  postContentPlaybackToken,
  postContentPosts,
  postDiscounts,
  postEvents,
  postEventsIdCancel,
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
import { registerAccount } from "./commands/account";
import { registerAdmin } from "./commands/admin";
import { registerApiKeys } from "./commands/api-keys";
import { registerAuth } from "./commands/auth";
import { registerEventDates } from "./commands/event-dates";
import { registerReports } from "./commands/reports";
import { registerResource } from "./commands/resource";
import { registerTickets } from "./commands/tickets";
import { registerWorkspace } from "./commands/workspace";
import {
  configureClient,
  setAccountFlag,
  signedDownload,
  unwrap,
} from "./lib/api";
import { banner } from "./lib/banner";
import { parseData } from "./lib/input";
import { print } from "./lib/output";

/**
 * The whole command tree, built without parsing anything: index.ts runs it,
 * and tests can walk it.
 */
export const program = new Command();

program
  .name("ft")
  .description("Official FreeTicket CLI")
  .version(pkg.version, "-v, --version")
  .addHelpText("beforeAll", banner());

registerAuth(program);
registerAccount(program);
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
    {
      // Unlike delete, cancel keeps the event, its sales and tickets (every
      // date goes CANCELLED, the waiting room turns off). It refunds nothing:
      // that is `ft sales refund`. Idempotent on the backend, but still asks.
      name: "cancel",
      describe:
        "Cancel an event and all its dates (keeps sales/tickets; no refunds)",
      fn: postEventsIdCancel,
      confirm: true,
    },
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
  get: getSettlementsId,
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
      // The contract's SaleRefundRequest only takes `acknowledge_manual` and is
      // additionalProperties:false, so there is no partial-amount field to pass.
      // The old text promised one and earned a guaranteed 422 (issue #42).
      describe:
        "Refund a sale (--data '{\"acknowledge_manual\":true}' for a manual/offline refund)",
      fn: postSalesIdRefund,
      body: true,
    },
    {
      name: "tickets",
      describe: "List the individual tickets/attendees of a sale",
      fn: getSalesIdTickets,
    },
    {
      // Answers "why didn't this sale go through?": one row per gateway
      // movement (approved, declined, refunded), newest first (contract 1.19).
      name: "attempts",
      describe:
        "Payment attempt history of a sale (declines, approvals, refunds)",
      fn: getSalesIdAttempts,
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
  // PATCH keeps the signingSecret; delete + create would rotate it.
  update: patchWebhooksId,
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
  get: getStaffId,
  create: postStaff,
  // Revokes access to THIS workspace only; the account and its other
  // workspaces stay. An ADMIN cannot revoke another admin (403) or itself (409).
  del: deleteStaffId,
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

// Content lives on the B2B contract since 1.7.0 (free-admin#356) and the mcp
// already exposed it; only the CLI was missing it (issue #40). Videos and lives
// are read-only listings; posts gained `create` in contract 1.19. playback-token
// is an action that mints a short-lived signed URL, so it goes under `lives`
// rather than as a CRUD verb.
registerResource(program, {
  name: "content-videos",
  describe: "Organization videos",
  list: getContentVideos,
  columns: ["id", "title", "publishedAt", "memberOnly"],
});

registerResource(program, {
  name: "content-posts",
  describe: "Organization posts",
  list: getContentPosts,
  // type=ARTICLE needs title + body (Markdown); TEXT/IMAGE need content or
  // imageUrl. Minimum role ADMIN (contract 1.19).
  create: postContentPosts,
  columns: ["id", "title", "publishedAt", "memberOnly"],
});

registerResource(program, {
  name: "content-lives",
  describe: "Organization live streams",
  list: getContentLives,
  get: getContentLivesId,
  columns: ["id", "title", "status", "startsAt", "memberOnly"],
  extend: (root) => {
    root
      .command("playback-token")
      .description(
        "Mint a signed playback token (30 min live / 1 h video). `memberOnly` content needs a buyer session.",
      )
      .requiredOption("--data <json>", "JSON body (inline or @file.json)")
      .option("--workspace <id>", "workspace override")
      .option("--json", "raw JSON output")
      .action(async (opts) => {
        configureClient(opts.workspace);
        const body = unwrap(
          await postContentPlaybackToken({
            body: parseData(opts.data) as never,
          }),
        );
        print(body?.data ?? body, { json: opts.json });
      });
  },
});

registerTickets(program);
registerReports(program);
registerApiKeys(program);
registerAdmin(program);

// `--account <name>` goes wherever `--workspace` does: both narrow what one
// command reads or acts on. Added here in one pass instead of next to every
// `--workspace` so no command family can miss it. `admin` is skipped: its
// `--workspace` is a filter and it authenticates with a superadmin session.
function addAccountOption(cmd: Command): void {
  if (cmd.name() === "admin") return;
  const longs = cmd.options.map((o) => o.long);
  if (longs.includes("--workspace") && !longs.includes("--account"))
    cmd.option(
      "--account <name>",
      "use only this stored account (default: all of them; see `ft account list`)",
    );
  for (const sub of cmd.commands) addAccountOption(sub);
}
addAccountOption(program);
program.hook("preAction", (_program, action) => {
  setAccountFlag(action.opts().account);
});
