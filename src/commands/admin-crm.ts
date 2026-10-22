import chalk from "chalk";
import type { Command } from "commander";
import {
  getCrmCampaigns,
  getCrmCampaignsId,
  getCrmEventDates,
  getCrmEvents,
  getCrmOptions,
  getCrmQuota,
  postCrmAudiencePreview,
  postCrmCampaigns,
  postCrmCampaignsIdBatchesNext,
  postCrmCampaignsIdBatchesStop,
  postCrmCampaignsIdCancel,
} from "../admin-client/sdk.gen";
import type {
  AdminCrmAudienceFilter,
  AdminCrmAudiencePreview,
  AdminCrmCampaignDetail,
  AdminCrmLaunchInput,
  AdminCrmSender,
} from "../admin-client/types.gen";
import { configureAdminClient, fail, unwrap } from "../lib/api";
import { confirmOrExit, parseData } from "../lib/input";
import { print, resolveColumns, toCsv } from "../lib/output";

/**
 * `ft admin crm …` — the master CRM (/api/admin/crm) for the internal team.
 *
 * Every write sends real messages to real customers, so:
 * - each one shows what it is about to touch (audience preview for `launch`,
 *   the campaign for `cancel` / `batches`) and then goes through
 *   `confirmOrExit` — no TTY and no `--yes` is a hard stop;
 * - POSTs are never retried by the CLI. A timeout on `launch` may still have
 *   created the campaign; the backend's DUPLICATE_CAMPAIGN guard (same
 *   channel, sender and subject within 10 minutes) is the safety net, and the
 *   error points at the existing id.
 */

const CAMPAIGN_COLUMNS = [
  "id",
  "subject",
  "channel",
  "status",
  "senderName",
  "recipientCount",
  "sentCount",
  "failedCount",
  "scheduledAt",
  "nextBatchAt",
  "createdAt",
];

const EVENT_COLUMNS = [
  "id",
  "name",
  "orgName",
  "status",
  "city",
  "dateCount",
  "nextAt",
  "lastAt",
];

const DATE_COLUMNS = [
  "id",
  "eventId",
  "startsAt",
  "label",
  "status",
  "venueName",
  "city",
  "past",
  "buyers",
];

type SdkResult<T> = { data?: T; error?: unknown; response: Response };

type CrmError = {
  code?: string;
  message?: string;
  retryable?: boolean;
  details?: unknown;
};

/** `Retry-After` (seconds) of a response, if the backend sent one. */
function retryAfterSeconds(res: Response | undefined): number | undefined {
  const raw = res?.headers.get("retry-after");
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isFinite(n)) return n;
  const at = Date.parse(raw);
  return Number.isNaN(at)
    ? undefined
    : Math.max(0, Math.round((at - Date.now()) / 1000));
}

/** "Nov 3, 7:00 PM (Bogotá), in 2h 15m" for a delay in seconds. */
export function describeWhen(seconds: number, now = Date.now()): string {
  const at = new Date(now + seconds * 1000);
  const local = at.toLocaleString("en-US", {
    timeZone: "America/Bogota",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const mins = Math.ceil(seconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const rel = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return `${local} (Bogotá), in ${rel} — ${at.toISOString()}`;
}

const PAYLOAD_HINT =
  "The request body is over the backend limit (256 KB). Trim the JSON: long `people` email lists, a huge `body`, or ids that could be a scope instead.";

/**
 * The error message + next step for the CRM's named errors. `null` when the
 * code is not one of them (the generic `unwrap` handles it).
 */
export function crmErrorHint(
  err: CrmError,
  retryAfter: number | undefined,
): string | null {
  switch (err.code) {
    case "OUTSIDE_SEND_WINDOW":
      return [
        retryAfter !== undefined
          ? `The WhatsApp send window (9:00-20:00 Bogotá) opens ${describeWhen(retryAfter)}.`
          : "The WhatsApp send window (9:00-20:00 Bogotá) is closed.",
        "Retry then, or pass --ignore-window to send now.",
      ].join("\n");
    case "DUPLICATE_CAMPAIGN": {
      const id = (err.details as { existingId?: string } | undefined)
        ?.existingId;
      return id
        ? `A campaign with the same channel, sender and subject was launched less than 10 minutes ago: ${id}\nSee it with \`ft admin crm campaigns get ${id}\`. Change the subject if this one is really different.`
        : "A campaign with the same channel, sender and subject was launched less than 10 minutes ago. Check `ft admin crm campaigns list`.";
    }
    case "QUOTA_EXHAUSTED":
      return retryAfter !== undefined
        ? `The daily WhatsApp quota is used up. It frees up ${describeWhen(retryAfter)}. See \`ft admin crm quota\`.`
        : "The daily WhatsApp quota is used up. See `ft admin crm quota`.";
    case "INVALID_STATE":
      return "The campaign does not allow this right now (already sent, a batch is going out, or nothing is pending). Check it with `ft admin crm campaigns get <id>`.";
    case "EMPTY_AUDIENCE":
      return "The filter matches nobody. Adjust it and check with `ft admin crm preview`.";
    case "WHATSAPP_BLOCKED":
      return "WhatsApp sending is blocked for this template or sender. See `whatsappBlockedReason` in `ft admin crm options`.";
    case "PAYLOAD_TOO_LARGE":
      return PAYLOAD_HINT;
    case "WHATSAPP_UNAVAILABLE":
      return "The WhatsApp provider did not answer. Safe to retry by hand in a moment - the CLI never retries a write on its own.";
    default:
      return null;
  }
}

/**
 * `unwrap` plus the CRM's named errors. Formats the envelope itself because
 * `details` is not always a list here (`{ existingId }` on a duplicate).
 */
function crmUnwrap<T>(res: SdkResult<T>): T {
  if (res.data !== undefined) return res.data;
  const err = (res.error as { error?: CrmError } | undefined)?.error;
  const status = res.response?.status;
  if (!err && status === 413)
    fail(
      "Error 413 [PAYLOAD_TOO_LARGE]: request body too large.",
      PAYLOAD_HINT,
    );
  if (!err) return unwrap(res);
  const lines = [
    `Error ${status ?? ""} [${err.code ?? "?"}]: ${err.message ?? "unknown failure"}`,
  ];
  if (Array.isArray(err.details)) {
    for (const d of err.details as { path?: unknown; message?: string }[]) {
      const path = Array.isArray(d.path) ? d.path.join(".") : (d.path ?? "");
      lines.push(`  · ${path}: ${d.message ?? ""}`.trimEnd());
    }
  }
  const hint = crmErrorHint(err, retryAfterSeconds(res.response));
  if (hint) fail(lines.join("\n"), hint);
  return unwrap(res);
}

/** `--sender freeticket|<workspaceId>` → the contract's `sender`. */
export function parseSender(value: string): AdminCrmSender {
  const v = value.trim();
  if (!v) fail("Empty --sender. Use `freeticket` or a workspace id.");
  return v.toLowerCase() === "freeticket"
    ? { kind: "freeticket" }
    : { kind: "organization", workspaceId: v };
}

function senderLabel(sender: AdminCrmSender | undefined): string {
  if (!sender) return "(not set)";
  return sender.kind === "freeticket"
    ? "FreeTicket"
    : `organization ${sender.workspaceId}`;
}

/**
 * Human summary of a preview, on stderr so `--json` stays clean on stdout.
 * Exported for tests.
 */
export function previewSummary(
  p: AdminCrmAudiencePreview,
  channel?: string,
): string[] {
  const c = p.counts;
  const lines = [
    `${chalk.bold("Audience")}: ${c.total} people`,
    `  matched ${c.matched} · excluded by "except" ${c.excludedByExcept} · by frequency ${c.excludedByFrequency} · unsubscribed ${c.suppressed}`,
    `  with email: ${c.total} · reachable by WhatsApp: ${c.reachableWhatsapp} · without phone: ${c.withoutPhone}`,
  ];
  if (p.whatsappEstimate && channel !== "EMAIL") {
    const e = p.whatsappEstimate;
    lines.push(
      `  WhatsApp: ~${e.days} day(s) to reach everyone (cap ${e.dailyCap}/day, ${e.remainingToday} left today)`,
    );
  }
  if (p.senderChoice?.forced) {
    lines.push(
      "  sender: must be FreeTicket (the scope spans several organizations)",
    );
  } else if (p.senderChoice && "organization" in p.senderChoice) {
    const o = p.senderChoice.organization;
    lines.push(`  sender: can sign as FreeTicket or ${o.name} (${o.id})`);
  }
  return lines;
}

/** Shows a campaign before a write on it, and returns it. */
async function showCampaign(id: string): Promise<AdminCrmCampaignDetail> {
  const c = crmUnwrap(await getCrmCampaignsId({ path: { id } })).data;
  console.error(
    [
      `${chalk.bold(c.subject)} (${c.id})`,
      `  ${c.channel} · ${c.status} · sender ${c.senderName}`,
      `  recipients ${c.recipientCount ?? "?"} · sent ${c.sentCount ?? 0} · failed ${c.failedCount ?? 0}`,
      c.scheduledAt ? `  scheduled at ${c.scheduledAt}` : null,
      c.nextBatchAt ? `  next batch at ${c.nextBatchAt}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return c;
}

type TableOpts = {
  json?: boolean;
  csv?: boolean;
  columns?: string;
  full?: boolean;
};

function printRows(rows: unknown[], opts: TableOpts, fallback: string[]): void {
  const columns = resolveColumns(opts, fallback);
  if (opts.csv) {
    process.stdout.write(`${toCsv(rows, columns)}\n`);
    return;
  }
  print(rows, {
    json: opts.json,
    columns,
    columnsExplicit: Boolean(opts.columns),
  });
}

function tableOptions(cmd: Command): Command {
  return cmd
    .option("--columns <list>", "comma-separated columns to display")
    .option("--full", "show every field instead of the curated columns")
    .option("--csv", "CSV output")
    .option("--json", "raw JSON output");
}

export function registerAdminCrm(admin: Command): void {
  const crm = admin
    .command("crm")
    .description(
      "Master CRM: email / WhatsApp campaigns to buyers (writes send real messages)",
    );

  // ---------------------------------------------------------------- campaigns
  const campaigns = crm.command("campaigns").description("CRM campaigns");

  tableOptions(
    campaigns
      .command("list")
      .description("List campaigns, newest first")
      .option("--channel <c>", "EMAIL | WHATSAPP")
      .option(
        "--status <s>",
        "SENT | FAILED | DENIED | PROCESSING | APPROVED | SCHEDULED | CANCELLED",
      )
      .option("--limit <n>", "max results (server default 50)"),
  ).action(async (opts) => {
    configureAdminClient();
    const query: Record<string, unknown> = {};
    if (opts.channel) query.channel = String(opts.channel).toUpperCase();
    if (opts.status) query.status = String(opts.status).toUpperCase();
    if (opts.limit !== undefined) query.limit = Number(opts.limit);
    const body = crmUnwrap(await getCrmCampaigns({ query: query as never }));
    printRows(body.data, opts, CAMPAIGN_COLUMNS);
  });

  campaigns
    .command("get <id>")
    .description("Campaign detail: deliveries, errors, conversions")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      const body = crmUnwrap(await getCrmCampaignsId({ path: { id } }));
      print(body.data, { json: opts.json });
    });

  campaigns
    .command("cancel <id>")
    .description("Cancel a SCHEDULED campaign so it never goes out")
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      await showCampaign(id);
      await confirmOrExit(
        `Cancel campaign ${id}? It will not be sent`,
        opts.yes,
      );
      const body = crmUnwrap(await postCrmCampaignsIdCancel({ path: { id } }));
      print(body.data, { json: opts.json });
    });

  // ------------------------------------------------------------------ batches
  const batches = crm
    .command("batches")
    .description("WhatsApp batch sending of a campaign");

  batches
    .command("next <id>")
    .description("Send the next batch of pending recipients now")
    .option("--ignore-window", "send even outside the 9:00-20:00 Bogotá window")
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      await showCampaign(id);
      await confirmOrExit(
        `Send the next batch of campaign ${id}${opts.ignoreWindow ? " (ignoring the send window)" : ""}?`,
        opts.yes,
      );
      const body = crmUnwrap(
        await postCrmCampaignsIdBatchesNext({
          path: { id },
          ...(opts.ignoreWindow ? { body: { ignoreSendWindow: true } } : {}),
        }),
      );
      print(body.data, { json: opts.json });
    });

  batches
    .command("stop <id>")
    .description(
      "Stop batch sending: pending recipients are skipped (irreversible)",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (id, opts) => {
      configureAdminClient();
      await showCampaign(id);
      await confirmOrExit(
        `Stop campaign ${id}? Pending recipients will never be sent (irreversible)`,
        opts.yes,
      );
      const body = crmUnwrap(
        await postCrmCampaignsIdBatchesStop({ path: { id } }),
      );
      print(body.data, { json: opts.json });
    });

  // ------------------------------------------------------------------- events
  const events = crm
    .command("events")
    .description("Find shows and dates for a filter");

  tableOptions(
    events
      .command("search <query>")
      .description("Search shows by name")
      .option(
        "--purpose <p>",
        "scope | promote | except (promote = published shows only)",
        "scope",
      )
      .option(
        "--sender <workspaceId>",
        "with --purpose promote: only shows of this organization",
      ),
  ).action(async (query, opts) => {
    configureAdminClient();
    const purpose = String(opts.purpose);
    if (!["scope", "promote", "except"].includes(purpose))
      fail(`Invalid --purpose: ${purpose}. Use scope, promote or except.`);
    const body = crmUnwrap(
      await getCrmEvents({
        query: {
          query,
          purpose: purpose as "scope" | "promote" | "except",
          ...(opts.sender ? { senderWorkspaceId: opts.sender } : {}),
        },
      }),
    );
    printRows(body.data, opts, EVENT_COLUMNS);
  });

  tableOptions(
    events
      .command("dates <eventId...>")
      .description("Dates (functions) of one or more shows, with buyer counts"),
  ).action(async (eventIds: string[], opts) => {
    configureAdminClient();
    const ids = eventIds
      .flatMap((v) => v.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
    const body = crmUnwrap(
      await getCrmEventDates({ query: { eventIds: ids.join(",") } }),
    );
    printRows(body.data, opts, DATE_COLUMNS);
  });

  // ------------------------------------------------------------ options/quota
  crm
    .command("options")
    .description("Cities, genres/formats, plans and WhatsApp templates")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      print(crmUnwrap(await getCrmOptions({})).data, { json: opts.json });
    });

  crm
    .command("quota")
    .description("WhatsApp daily quota: used, remaining, committed batches")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      print(crmUnwrap(await getCrmQuota({})).data, { json: opts.json });
    });

  // ------------------------------------------------------------------ preview
  crm
    .command("preview")
    .description("Count an audience without creating anything")
    .requiredOption(
      "--filter <json>",
      "audience filter v2 (inline JSON or @filter.json)",
    )
    .option("--sender <s>", "freeticket | <workspaceId>")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const filter = parseData(opts.filter) as AdminCrmAudienceFilter;
      const body = crmUnwrap(
        await postCrmAudiencePreview({
          body: {
            filter,
            ...(opts.sender ? { sender: parseSender(opts.sender) } : {}),
          },
        }),
      );
      if (opts.json) {
        print(body.data, { json: true });
        return;
      }
      console.log(previewSummary(body.data).join("\n"));
      if (body.data.sample.length > 0) {
        console.log(chalk.dim("\nSample (masked):"));
        print(body.data.sample, {});
      }
    });

  // ------------------------------------------------------------------- launch
  crm
    .command("launch")
    .description(
      "Create an approved campaign (timing.mode now sends right away). Previews the audience first",
    )
    .requiredOption(
      "--data <json>",
      "campaign JSON: channel, sender, subject, body, filter, timing (inline or @campaign.json)",
    )
    .option(
      "--ignore-window",
      "WhatsApp with timing.mode now: send even outside the 9:00-20:00 Bogotá window",
    )
    .option("--yes", "skip confirmation")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureAdminClient();
      const input = parseData(opts.data) as AdminCrmLaunchInput;
      // The flag wins over the file, so the confirmation below tells the truth.
      if (opts.ignoreWindow && input && typeof input === "object")
        input.ignoreSendWindow = true;
      if (!input || typeof input !== "object" || !input.filter)
        fail(
          "--data needs a `filter` (and channel, sender, subject, body, timing).",
          "See the `ft admin crm` section of the README for a campaign.json example.",
        );
      // Same filter and sender the launch will use: what you confirm is what
      // the backend resolves.
      const preview = crmUnwrap(
        await postCrmAudiencePreview({
          body: {
            filter: input.filter,
            ...(input.sender ? { sender: input.sender } : {}),
          },
        }),
      ).data;
      console.error(
        [
          `${chalk.bold(input.subject ?? "(no subject)")} · ${input.channel ?? "?"} · sender ${senderLabel(input.sender)} · timing ${input.timing?.mode ?? "?"}`,
          ...previewSummary(preview, input.channel),
        ].join("\n"),
      );
      if (preview.counts.total === 0)
        fail("The audience is empty: nothing to launch.");
      const reach =
        input.channel === "WHATSAPP"
          ? preview.counts.reachableWhatsapp
          : preview.counts.total;
      const when =
        input.timing?.mode === "now"
          ? "right now"
          : input.timing?.mode === "batches"
            ? "in batches"
            : "on schedule";
      await confirmOrExit(
        `Launch to ${reach} people by ${input.channel ?? "?"}, sending ${when}${input.ignoreSendWindow ? " (ignoring the send window)" : ""}?`,
        opts.yes,
      );
      const body = crmUnwrap(await postCrmCampaigns({ body: input }));
      print(body.data, { json: opts.json });
      if (!opts.json)
        console.error(
          chalk.dim(
            `\nFollow it with \`ft admin crm campaigns get ${body.data.id}\``,
          ),
        );
    });
}
