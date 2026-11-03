import type { Command } from "commander";
import {
  deleteEventsIdViewersViewerId,
  getEventDatesIdAccessClose,
  getEventsIdValidators,
  getEventsIdViewers,
  getMasterQrs,
  getPaymentIntents,
  getReportsLiveAttendance,
  getTicketTemplates,
  patchMasterQrsId,
  postEventDatesIdAccessClose,
  postEventsIdValidators,
  postEventsIdViewers,
  postMasterQrs,
  postStaffIdResendInvite,
  postTicketTemplatesIdInstantiate,
  putMasterQrsIdActive,
  putStaffIdAccess,
} from "../client/sdk.gen";
import { fail } from "../lib/api";
import { parseLimit, wholeNumber } from "../lib/input";
import { list, op, orNull } from "./op";

/**
 * Box-office and door operations from contracts 1.26-1.36: who may see or
 * validate an event, staff access, the access-close record, live attendance,
 * the checkout funnel, master QRs and ticket templates. Each one hooks into
 * the family it belongs to.
 */

/** `ft events viewers …` and `ft events validators …` */
export function registerEventAccess(events: Command): void {
  const viewers = events
    .command("viewers")
    .description("Read-only viewers of an event's statistics");

  op(viewers, {
    name: "list <eventId>",
    describe: "People with read-only access to the event's statistics",
    call: ([eventId]) => getEventsIdViewers({ path: { id: eventId } }),
    columns: ["id", "email", "createdAt"],
  });

  op(viewers, {
    name: "add <eventId>",
    describe:
      "Grant read-only access to the event's statistics and email the link (creates a VIEWER account if needed)",
    required: [["--email <email>", "viewer's email"]],
    confirm: ([eventId], o) =>
      `Grant ${o.email} read-only access to event ${eventId} and email them?`,
    call: ([eventId], o) =>
      postEventsIdViewers({ path: { id: eventId }, body: { email: o.email } }),
  });

  op(viewers, {
    name: "remove <eventId> <viewerId>",
    describe:
      "Revoke a viewer's access (viewerId is the access id from `viewers list`; the account stays)",
    confirm: ([eventId, viewerId]) =>
      `Revoke viewer ${viewerId} of event ${eventId}?`,
    call: ([eventId, viewerId]) =>
      deleteEventsIdViewersViewerId({ path: { id: eventId, viewerId } }),
  });

  const validators = events
    .command("validators")
    .description("Door staff who can validate an event's tickets");

  op(validators, {
    name: "list <eventId>",
    describe:
      "Validators of the event (assigned to it, plus those with allEvents)",
    call: ([eventId]) => getEventsIdValidators({ path: { id: eventId } }),
    columns: ["id", "name", "email", "isActive", "allEvents"],
  });

  op(validators, {
    name: "add <eventId>",
    describe:
      "Assign door staff to the event (additive; creates a STAFF account and emails an invitation if needed)",
    required: [
      ["--name <name>", "validator's name"],
      ["--email <email>", "validator's email"],
    ],
    confirm: ([eventId], o) =>
      `Make ${o.name} <${o.email}> a validator of event ${eventId}? A new account gets an invitation email.`,
    call: ([eventId], o) =>
      postEventsIdValidators({
        path: { id: eventId },
        body: { name: o.name, email: o.email },
      }),
  });
}

const ACCESS_TYPES = ["admin", "validador", "personalizado", "lectura"];

/** Body flags of `staff access` (option key, flag), exclusive with --data. */
const ACCESS_FLAGS = [
  ["type", "--type"],
  ["sections", "--sections"],
  ["validatorEvents", "--validator-events"],
  ["viewerEvents", "--viewer-events"],
  ["expiresAt", "--expires-at"],
] as const;

/** `ft staff access <id>` and `ft staff resend-invite <id>` */
export function registerStaffAccess(staff: Command): void {
  op(staff, {
    name: "access <id>",
    describe:
      "Replace a staff member's access in this workspace (FULL replace: what you do not pass is removed)",
    options: [
      ["--type <t>", "admin | validador | personalizado | lectura"],
      [
        "--sections <list>",
        "personalizado: comma-separated sections (e.g. eventos,validar,informes)",
      ],
      [
        "--validator-events <ids>",
        "events they may validate (comma-separated; empty = all)",
      ],
      ["--viewer-events <ids>", "lectura: events whose stats they see"],
      ["--expires-at <date>", 'YYYY-MM-DD, or "none" for permanent'],
    ],
    data: "optional",
    check: (_args, o) => {
      if (o.data !== undefined) {
        // --data is the whole body: flags next to it would be dropped silently,
        // and in a full replace a dropped --sections is access removed.
        const mixed = ACCESS_FLAGS.filter(([key]) => o[key] !== undefined);
        if (mixed.length > 0)
          fail(
            `Pass either --data or the flags, not both (got --data and ${mixed.map(([, flag]) => flag).join(", ")}).`,
          );
        return;
      }
      if (!o.type) fail("Pass --type (or the whole body with --data).");
      if (!ACCESS_TYPES.includes(o.type))
        fail(`--type must be one of: ${ACCESS_TYPES.join(", ")}.`);
    },
    confirm: ([id], o) =>
      `Replace the access of staff ${id}${o.type ? ` with "${o.type}"` : ""}? Anything not in this request is removed.`,
    call: ([id], o, data) =>
      putStaffIdAccess({
        path: { id },
        body: (data ?? {
          accessType: o.type,
          sections: list(o.sections),
          validatorEventIds: list(o.validatorEvents),
          viewerEventIds: list(o.viewerEvents),
          expiresAt:
            o.expiresAt === undefined ? undefined : orNull(o.expiresAt),
        }) as never,
      }),
  });

  op(staff, {
    name: "resend-invite <id>",
    describe:
      "Email the staff member their invitation link again (same persistent link)",
    confirm: ([id]) => `Resend the invitation email to staff ${id}?`,
    call: ([id]) => postStaffIdResendInvite({ path: { id } }),
  });
}

/** `ft event-dates access-close status|sign <dateId>` */
export function registerAccessClose(eventDates: Command): void {
  const close = eventDates
    .command("access-close")
    .description("Access-close record of an event date (door count)");

  op(close, {
    name: "status <dateId>",
    describe: "Live entry count and whether the date is closed or signable",
    call: ([dateId]) => getEventDatesIdAccessClose({ path: { id: dateId } }),
  });

  op(close, {
    name: "sign <dateId>",
    describe:
      "Sign the access-close record: freezes the check-in count and emails it (IRREVERSIBLE; does not stop the scanner)",
    confirm: ([dateId]) =>
      `Sign the access-close record of date ${dateId}? This is irreversible.`,
    call: ([dateId]) =>
      postEventDatesIdAccessClose({
        path: { id: dateId },
        body: { confirm: true },
      }),
  });
}

/** `ft sales intents --event <id>` */
export function registerPaymentIntents(sales: Command): void {
  op(sales, {
    name: "intents",
    describe:
      "Purchase intents of an event: checkout funnel and abandoned journeys (personal data)",
    required: [["--event <id>", "event id"]],
    options: [
      ["--event-date <id>", "only this date"],
      ["--only-abandoned", "only journeys that did not buy"],
      ["--limit <n>", "rows per page (1-100)", parseLimit],
      ["--cursor <c>", "pagination cursor"],
    ],
    call: (_args, o) =>
      getPaymentIntents({
        query: {
          event: o.event,
          eventDate: o.eventDate,
          onlyAbandoned: o.onlyAbandoned ? true : undefined,
          limit: o.limit,
          cursor: o.cursor,
        },
      }),
    // The table shows the journeys; --json keeps funnel and cursor too.
    pick: (body, o) => {
      if (o.json) return body.data;
      if (body.data?.nextCursor)
        console.error(`More results: --cursor ${body.data.nextCursor}`);
      console.error(`Funnel: ${JSON.stringify(body.data?.funnel ?? {})}`);
      return body.data?.rows ?? [];
    },
    columns: [
      "personName",
      "personEmail",
      "stage",
      "outcome",
      "reason",
      "saleReference",
      "lastAt",
    ],
  });
}

/** `ft reports live-attendance` */
export function registerLiveAttendance(reports: Command): void {
  op(reports, {
    name: "live-attendance",
    describe: "Event dates happening right now, with check-in progress",
    options: [["--scope <s>", "all | own | partner:<orgId>"]],
    call: (_args, o) => getReportsLiveAttendance({ query: { scope: o.scope } }),
    columns: [
      "eventName",
      "city",
      "sold",
      "validated",
      "validatedPct",
      "eventDateId",
    ],
  });
}

/** Master QR `code` and `url` are secrets: whoever has them reaches the sale flow. */
const SECRET_QR_FIELDS = ["code", "url"];

/**
 * Drops `code`/`url` from a master QR (or a list of them) unless `--full`.
 * Applies to `--json` too: a JSON dump piped into a log or an agent's context
 * leaks the secret just as well as a table, and it cannot be rotated.
 */
export function redactMasterQr(data: unknown, full: boolean): unknown {
  if (full) return data;
  const strip = (row: unknown) =>
    row && typeof row === "object"
      ? Object.fromEntries(
          Object.entries(row).filter(([k]) => !SECRET_QR_FIELDS.includes(k)),
        )
      : row;
  return Array.isArray(data) ? data.map(strip) : strip(data);
}

const FULL: [string, string] = [
  "--full",
  "include the secret code and url (table and --json)",
];

/** `ft master-qrs list|create|update|activate|deactivate` (delete is CRUD). */
export function extendMasterQrs(root: Command): void {
  op(root, {
    name: "list",
    describe:
      "Master box-office QR codes (`code`/`url` are secret: left out, also from --json, unless --full)",
    options: [FULL],
    call: () => getMasterQrs({}),
    pick: (body, o) => redactMasterQr(body.data, Boolean(o.full)),
    columns: (o) =>
      o.full
        ? undefined
        : ["id", "label", "mode", "eventId", "active", "scans", "lastScanAt"],
  });
  op(root, {
    name: "create",
    describe:
      "Create a master QR. Prints its SECRET code and url: you need them to print the QR, they never rotate, and whoever has them reaches the sale flow. Keep the output private.",
    data: "required",
    call: (_a, _o, data) => postMasterQrs({ body: data as never }),
  });
  op(root, {
    name: "update <id>",
    describe:
      "Update a master QR (label, mode, eventId, ticketTypeId). The secret code/url are left out of the output unless --full",
    data: "required",
    options: [FULL],
    call: ([id], _o, data) =>
      patchMasterQrsId({ path: { id }, body: data as never }),
    pick: (body, o) => redactMasterQr(body.data, Boolean(o.full)),
  });
  for (const [name, active] of [
    ["activate", true],
    ["deactivate", false],
  ] as const)
    op(root, {
      name: `${name} <id>`,
      describe: `${active ? "Activate" : "Deactivate"} a master QR (a deactivated QR stops opening the sale flow)`,
      call: ([id]) => putMasterQrsIdActive({ path: { id }, body: { active } }),
    });
}

/** Extras of `ft ticket-templates`: list and instantiate. */
export function extendTicketTemplates(root: Command): void {
  op(root, {
    name: "list",
    describe: "Ticket templates of the workspace",
    call: () => getTicketTemplates({}),
    columns: ["id", "name", "price", "currency", "capacity", "isActive"],
  });
  op(root, {
    name: "instantiate <templateId>",
    describe: "Create a ticket type on an event date from a template",
    required: [["--event-date <id>", "event date that gets the ticket type"]],
    options: [
      ["--name <name>", "override the template's name"],
      [
        "--price <n>",
        "override the price (whole COP, no separators: 50000)",
        wholeNumber("--price"),
      ],
      [
        "--capacity <n>",
        "override the capacity (whole number)",
        wholeNumber("--capacity"),
      ],
    ],
    call: ([templateId], o) =>
      postTicketTemplatesIdInstantiate({
        path: { id: templateId },
        body: {
          eventDateId: o.eventDate,
          name: o.name,
          price: o.price,
          capacity: o.capacity,
        },
      }),
  });
}
