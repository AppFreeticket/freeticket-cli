import chalk from "chalk";
import type { Command } from "commander";
import {
  deleteEventsIdArtistInvitationsInvitationId,
  deleteEventsIdArtistsOrganizationId,
  getArtists,
  getEventsId,
  getEventsIdArtistInvitations,
  postEventsIdArtistInvitationsInvitationIdResend,
  putEventsIdArtists,
} from "../client/sdk.gen";
import { configureClient, unwrap } from "../lib/api";
import { confirmOrExit, parseLimit } from "../lib/input";
import { print, printNextCursor } from "../lib/output";

/** Prints API `warnings[]` (e.g. ARTIST_IDS_IGNORED) on stderr, keeping stdout clean for --json. */
function printWarnings(
  warnings?: { code: string; message: string; ids?: string[] }[],
): void {
  for (const w of warnings ?? [])
    console.error(
      chalk.yellow(
        `warning [${w.code}]: ${w.message}${w.ids?.length ? ` (${w.ids.join(", ")})` : ""}`,
      ),
    );
}

/**
 * `ft artists search <q>` — resolves registered artist workspaces (across
 * FreeTicket, not just yours) to the ids `ft events artists set` takes.
 */
export function registerArtists(program: Command): void {
  const root = program
    .command("artists")
    .description("Artists registered on FreeTicket (to build event lineups)");

  root
    .command("search <q>")
    .description("Search registered artists by name (2+ characters)")
    .option("--limit <n>", "results per page (1-100)", parseLimit, 20)
    .option("--cursor <id>", "pagination cursor")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (q, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getArtists({
          query: { q, limit: opts.limit, cursor: opts.cursor },
        }),
      );
      print(body.data, {
        json: opts.json,
        columns: ["id", "name", "slug"],
      });
      if (!opts.json) printNextCursor(body.page);
    });
}

/**
 * `ft events artists set|remove` and `ft events invitations list|resend|cancel`
 * — the event lineup (contract 1.25.0). Hooked under `ft events` through
 * registerResource's `extend`, because the paths take two ids.
 */
export function registerEventLineup(events: Command): void {
  const artists = events
    .command("artists")
    .description("Event lineup: the artists linked to an event");

  artists
    .command("set <eventId>")
    .description(
      "Replace the lineup with --artist ids, in order (unlisted artists are unlinked; no --artist clears it)",
    )
    .option(
      "--artist <id...>",
      "artist workspace id (from `ft artists search`), in lineup order",
    )
    .option(
      "--invite <email...>",
      "invite artists without an account (additive; sends them an email, so it asks)",
    )
    .option(
      "--yes",
      "skip confirmation (asked when artists would be removed or invitations emailed)",
    )
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, opts) => {
      configureClient(opts.workspace);
      const artistIds: string[] = opts.artist ?? [];
      const invites: string[] = opts.invite ?? [];
      if (!opts.yes) {
        // The PUT replaces the whole lineup: name who drops out before asking.
        const current = unwrap(await getEventsId({ path: { id: eventId } }));
        const removed = (current.data.artists ?? []).filter(
          (a) => !artistIds.includes(a.id),
        );
        const asks: string[] = [];
        if (artistIds.length === 0)
          asks.push(
            `Clear the lineup of event ${eventId}${removed.length ? ` (removes ${removed.map((a) => a.name).join(", ")})` : ""}`,
          );
        else if (removed.length > 0)
          asks.push(
            `Remove ${removed.map((a) => a.name).join(", ")} from event ${eventId}`,
          );
        // Each invitation is an email to someone outside FreeTicket.
        if (invites.length > 0)
          asks.push(`email an invitation to ${invites.join(", ")}`);
        const question = asks.join(" and ");
        if (question)
          await confirmOrExit(
            `${question[0]?.toUpperCase()}${question.slice(1)}?`,
            false,
          );
      }
      const body = unwrap(
        await putEventsIdArtists({
          path: { id: eventId },
          body: { artistIds, inviteEmails: opts.invite },
        }),
      );
      printWarnings(body.warnings);
      print(opts.json ? body : body.data.artists, {
        json: opts.json,
        columns: ["id", "name", "slug", "type"],
      });
    });

  artists
    .command("remove <eventId> <organizationId>")
    .description(
      "Unlink one artist from an event (owner, or the artist itself)",
    )
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, organizationId, opts) => {
      await confirmOrExit(
        `Remove artist ${organizationId} from event ${eventId}?`,
        opts.yes,
      );
      configureClient(opts.workspace);
      const body = unwrap(
        await deleteEventsIdArtistsOrganizationId({
          path: { id: eventId, organizationId },
        }),
      );
      print(body.data, { json: opts.json });
    });

  const invitations = events
    .command("invitations")
    .description(
      "Pending/expired invitations sent to artists without an account",
    );

  invitations
    .command("list <eventId>")
    .description("List an event's artist invitations (newest first)")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, opts) => {
      configureClient(opts.workspace);
      const body = unwrap(
        await getEventsIdArtistInvitations({ path: { id: eventId } }),
      );
      print(body.data, {
        json: opts.json,
        columns: ["id", "email", "status", "expiresAt", "createdAt"],
      });
    });

  invitations
    .command("resend <eventId> <invitationId>")
    .description(
      "Resend an invitation email and renew it for 14 days (asks; --yes skips)",
    )
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, invitationId, opts) => {
      await confirmOrExit(
        `Resend invitation ${invitationId} of event ${eventId}? The artist gets another email.`,
        opts.yes,
      );
      configureClient(opts.workspace);
      const body = unwrap(
        await postEventsIdArtistInvitationsInvitationIdResend({
          path: { id: eventId, invitationId },
        }),
      );
      print(body.data, { json: opts.json });
    });

  invitations
    .command("cancel <eventId> <invitationId>")
    .description("Cancel (delete) a pending artist invitation")
    .option("--yes", "skip confirmation")
    .option("--workspace <id>", "workspace override")
    .option("--json", "raw JSON output")
    .action(async (eventId, invitationId, opts) => {
      await confirmOrExit(
        `Cancel invitation ${invitationId} of event ${eventId}?`,
        opts.yes,
      );
      configureClient(opts.workspace);
      const body = unwrap(
        await deleteEventsIdArtistInvitationsInvitationId({
          path: { id: eventId, invitationId },
        }),
      );
      print(body.data, { json: opts.json });
    });
}
