import { readFileSync } from "node:fs";
import type { Command } from "commander";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

/**
 * End-to-end through commander: a destructive command run without a TTY and
 * without --yes must exit 1 BEFORE the SDK call. The generated SDK functions
 * are mocked so nothing could reach the network even if the gate regressed.
 *
 * Each CASES row is checked both ways: refused without --yes, and with --yes
 * its SDK function is called exactly once. Without the second half a row
 * could point at a function its command never calls (or at another command's
 * function) and the "never calls" assertion would pass vacuously.
 */
const sdk = vi.hoisted(() => ({
  postEventsIdCancel: vi.fn(),
  deleteStaffId: vi.fn(),
  deleteEventsIdArtistsOrganizationId: vi.fn(),
  deleteEventsIdArtistInvitationsInvitationId: vi.fn(),
  deletePresaleWindowsId: vi.fn(),
  postSalesIdItemsItemIdTransfer: vi.fn(),
  patchSalesIdRecipient: vi.fn(),
  deleteTicketsTicketCodeCheckin: vi.fn(),
  deleteEventsIdViewersViewerId: vi.fn(),
  putStaffIdAccess: vi.fn(),
  deleteContentLivesId: vi.fn(),
  postEventDatesIdAccessClose: vi.fn(),
  postSalesIdAbandon: vi.fn(),
  deleteContentPostsId: vi.fn(),
  deleteContentCommentsId: vi.fn(),
  postContentChannelsIdArchive: vi.fn(),
  postContentModerationMemberPostsIdReject: vi.fn(),
  postContentModerationMemberPostsIdRemove: vi.fn(),
  postContentMembersIdBan: vi.fn(),
  postContentMeetupsIdCancel: vi.fn(),
  deleteProductsId: vi.fn(),
  deleteContentVideosId: vi.fn(),
  deleteContentSeriesId: vi.fn(),
  postContentLivesIdResetKey: vi.fn(),
  deleteTicketTemplatesId: vi.fn(),
  deleteMasterQrsId: vi.fn(),
  postEventsIdViewers: vi.fn(),
  postEventsIdValidators: vi.fn(),
  postStaffIdResendInvite: vi.fn(),
  postContentMeetupsIdPublish: vi.fn(),
  patchContentMeetupsIdRsvpsRsvpId: vi.fn(),
  postEventsIdArtistInvitationsInvitationIdResend: vi.fn(),
  putEventsIdArtists: vi.fn(),
  putContentVideosIdPublished: vi.fn(),
  putWebsite: vi.fn(),
  // Read by `events artists set` before it asks (who would drop out).
  getEventsId: vi.fn(),
  deleteWorkspacesId: vi.fn(),
}));

const { deleteWorkspacesId, ...b2b } = sdk;

vi.mock("./client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client/sdk.gen")>()),
  ...b2b,
}));

vi.mock("./admin-client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin-client/sdk.gen")>()),
  deleteWorkspacesId,
}));

const { program } = await import("./program");

/** A 200 the commands can print (lineup `set` reads `data.artists`). */
const ok = () => ({
  data: { data: { artists: [] } },
  response: new Response(),
});

describe("destructive commands refuse without a TTY and without --yes", () => {
  const tty = process.stdin.isTTY;
  let exit: MockInstance<typeof process.exit>;
  let stderr: MockInstance<typeof console.error>;

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    // Credentials, so the only thing that can stop a command is the gate (the
    // SDK is mocked: they never reach a network). Commands that configure the
    // client before asking (`events artists set`) need them for the refusal.
    vi.stubEnv("FT_API_KEY", "ft_test_key");
    vi.stubEnv("FT_ADMIN_SESSION", "test-session");
    for (const fn of Object.values(sdk)) fn.mockResolvedValue(ok());
    // The lineup already has org_1, so `set --artist org_1 --invite …` removes
    // nobody: what it asks about is the invitation email alone.
    sdk.getEventsId.mockResolvedValue({
      data: { data: { artists: [{ id: "org_1", name: "Artist One" }] } },
      response: new Response(),
    });
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: tty,
      configurable: true,
    });
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  it.each(CASES)("ft %j exits 1 and never calls the SDK", async (args, fn) => {
    await expect(
      program.parseAsync(["node", "ft", ...(args as string[])]),
    ).rejects.toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    // The exit must come from the confirmation gate, not e.g. "Not logged in".
    expect(stderr.mock.calls[0]?.[0]).toMatch(/^Refusing: .*no TTY to confirm/);
    expect(fn).not.toHaveBeenCalled();
  });

  it.each(
    CASES,
  )("ft %j --yes calls its SDK function exactly once", async (args, fn) => {
    await program.parseAsync(["node", "ft", ...(args as string[]), "--yes"]);
    expect(exit).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("covers every operation the contract marks x-ft-destructive", () => {
    const spec = JSON.parse(readFileSync("openapi.json", "utf8"));
    const destructive = Object.values(spec.paths).flatMap((ops) =>
      Object.values(ops as Record<string, Record<string, unknown>>)
        .filter((op) => op?.["x-ft-destructive"] === true)
        .map((op) => op.operationId as string),
    );
    const gated = Object.entries(sdk)
      .filter(([, fn]) => CASES.some(([, f]) => f === fn))
      .map(([name]) => name);
    expect(destructive.length).toBeGreaterThan(0);
    expect(destructive.filter((id) => !gated.includes(id))).toEqual([]);
  });
});

const CASES: [string[], (typeof sdk)[keyof typeof sdk]][] = [
  [["events", "cancel", "evt_1"], sdk.postEventsIdCancel],
  [["staff", "delete", "stf_1"], sdk.deleteStaffId],
  [["admin", "workspaces", "delete", "ws_1"], sdk.deleteWorkspacesId],
  [
    ["events", "artists", "remove", "evt_1", "org_1"],
    sdk.deleteEventsIdArtistsOrganizationId,
  ],
  [
    ["events", "invitations", "cancel", "evt_1", "inv_1"],
    sdk.deleteEventsIdArtistInvitationsInvitationId,
  ],
  [["presale-windows", "delete", "pw_1"], sdk.deletePresaleWindowsId],
  [
    ["sales", "transfer", "sale_1", "item_1", "--email", "a@b.co"],
    sdk.postSalesIdItemsItemIdTransfer,
  ],
  [
    [
      "sales",
      "recipient",
      "set",
      "sale_1",
      "--name",
      "Ana",
      "--email",
      "a@b.co",
    ],
    sdk.patchSalesIdRecipient,
  ],
  [["tickets", "checkin-undo", "TKT1"], sdk.deleteTicketsTicketCodeCheckin],
  // Contracts 1.26-1.36.
  [
    ["events", "viewers", "remove", "evt_1", "vw_1"],
    sdk.deleteEventsIdViewersViewerId,
  ],
  [["staff", "access", "stf_1", "--type", "lectura"], sdk.putStaffIdAccess],
  [
    ["event-dates", "access-close", "sign", "date_1"],
    sdk.postEventDatesIdAccessClose,
  ],
  [["sales", "abandon", "sale_1"], sdk.postSalesIdAbandon],
  [["content-lives", "delete", "live_1"], sdk.deleteContentLivesId],
  [["content-lives", "reset-key", "live_1"], sdk.postContentLivesIdResetKey],
  [["content-posts", "delete", "post_1"], sdk.deleteContentPostsId],
  [["content-videos", "delete", "vid_1"], sdk.deleteContentVideosId],
  [["content-series", "delete", "ser_1"], sdk.deleteContentSeriesId],
  [["content-comments", "delete", "cmt_1"], sdk.deleteContentCommentsId],
  [["content-channels", "archive", "ch_1"], sdk.postContentChannelsIdArchive],
  [
    ["content-moderation", "reject", "post_1"],
    sdk.postContentModerationMemberPostsIdReject,
  ],
  [
    ["content-moderation", "remove", "post_1"],
    sdk.postContentModerationMemberPostsIdRemove,
  ],
  [
    ["content-members", "ban", "cus_1", "--comment", "cmt_1"],
    sdk.postContentMembersIdBan,
  ],
  [["content-meetups", "cancel", "mt_1"], sdk.postContentMeetupsIdCancel],
  [["products", "delete", "prd_1"], sdk.deleteProductsId],
  [["ticket-templates", "delete", "tpl_1"], sdk.deleteTicketTemplatesId],
  [["master-qrs", "delete", "mq_1"], sdk.deleteMasterQrsId],
  // Not x-ft-destructive, but they send email or notify a whole community:
  // same gate, so a script cannot fire them by accident.
  [
    ["events", "viewers", "add", "evt_1", "--email", "a@b.co"],
    sdk.postEventsIdViewers,
  ],
  [
    [
      "events",
      "validators",
      "add",
      "evt_1",
      "--name",
      "Ana",
      "--email",
      "a@b.co",
    ],
    sdk.postEventsIdValidators,
  ],
  [["staff", "resend-invite", "stf_1"], sdk.postStaffIdResendInvite],
  [["content-meetups", "publish", "mt_1"], sdk.postContentMeetupsIdPublish],
  [
    ["content-meetups", "rsvp", "mt_1", "rsvp_1", "--approve"],
    sdk.patchContentMeetupsIdRsvpsRsvpId,
  ],
  [
    ["events", "invitations", "resend", "evt_1", "inv_1"],
    sdk.postEventsIdArtistInvitationsInvitationIdResend,
  ],
  [
    [
      "events",
      "artists",
      "set",
      "evt_1",
      "--artist",
      "org_1",
      "--invite",
      "a@b.co",
    ],
    sdk.putEventsIdArtists,
  ],
  [["content-videos", "publish", "vid_1"], sdk.putContentVideosIdPublished],
  // Not an email, but a FULL replace: a partial --data wipes the rest.
  [["website", "set", "--data", '{"sections":[]}'], sdk.putWebsite],
];

/** Every leaf of the command tree, as `"events artists set"`. */
function leaves(cmd: Command, path: string[] = []): [string, Command][] {
  if (cmd.commands.length === 0) return [[path.join(" "), cmd]];
  return cmd.commands.flatMap((sub) => leaves(sub, [...path, sub.name()]));
}
/** The command path that argv resolves to (subcommand names, no args). */
function commandPath(args: string[]): string {
  const path: string[] = [];
  let cmd: Command = program;
  for (const arg of args) {
    const sub = cmd.commands.find(
      (c) => c.name() === arg || c.aliases().includes(arg),
    );
    if (!sub) break;
    path.push(sub.name());
    cmd = sub;
  }
  return path.join(" ");
}
const hasYes = (cmd: Command) => cmd.options.some((o) => o.long === "--yes");

/**
 * Writes that notify someone and still run without asking, on purpose. If one
 * of them gains a gate, or disappears, the sweep below fails and this list is
 * revisited instead of rotting.
 */
const UNGATED_ON_PURPOSE: Record<string, string> = {
  "content-moderation approve":
    "approving IS the reviewer's decision, and --expected-updated-at already pins the exact version read; the author's notification is the point",
  "tickets resend":
    "one email to the ticket's own buyer, the same QR again: the command exists to send it",
  "content-posts create":
    "the --data body is the message itself; with community_v2 members are notified like in the dashboard (no draft step to confirm separately)",
  "products update":
    "only new lessons on a published course notify its buyers, like the dashboard; the body is a full tree read just before",
};

describe("confirmation gates across the whole command tree", () => {
  it("exactly these commands accept --yes", () => {
    // A new destructive or notifying command that forgets its gate, or a gate
    // dropped by a refactor, changes this list: update it on purpose.
    expect(
      leaves(program)
        .filter(([, cmd]) => hasYes(cmd))
        .map(([path]) => path)
        .sort(),
    ).toEqual([
      "admin feature-flags set",
      "admin impersonate",
      "admin tokens revoke",
      "admin workspaces delete",
      "admin workspaces plan",
      "admin workspaces plan-show",
      "admin workspaces restore",
      "admin workspaces suspend",
      "api-keys revoke",
      "content-channels archive",
      "content-comments delete",
      "content-lives delete",
      "content-lives reset-key",
      "content-meetups cancel",
      "content-meetups publish",
      "content-meetups rsvp",
      "content-members ban",
      "content-moderation reject",
      "content-moderation remove",
      "content-posts delete",
      "content-series delete",
      "content-videos delete",
      "content-videos publish",
      "discounts delete",
      "event-dates access-close sign",
      "event-dates delete",
      "events artists remove",
      "events artists set",
      "events cancel",
      "events delete",
      "events invitations cancel",
      "events invitations resend",
      "events validators add",
      "events viewers add",
      "events viewers remove",
      "master-qrs delete",
      "plans delete",
      "presale-windows delete",
      "products delete",
      "sales abandon",
      "sales recipient set",
      "sales transfer",
      "staff access",
      "staff delete",
      "staff resend-invite",
      "ticket-templates delete",
      "ticket-types delete",
      "tickets checkin-undo",
      "venues delete",
      "webhooks delete",
      "website set",
    ]);
  });

  it("every CASES row is a gated command of the tree", () => {
    const gated = new Set(
      leaves(program)
        .filter(([, cmd]) => hasYes(cmd))
        .map(([path]) => path),
    );
    const rows = CASES.map(([args]) => commandPath(args));
    expect(rows.filter((r) => !gated.has(r))).toEqual([]);
  });

  it.each(
    Object.entries(UNGATED_ON_PURPOSE),
  )("%s still exists and still runs without a gate", (path) => {
    const leaf = leaves(program).find(([p]) => p === path);
    expect(
      leaf,
      `${path} is gone: drop it from UNGATED_ON_PURPOSE`,
    ).toBeDefined();
    expect(hasYes(leaf?.[1] as Command)).toBe(false);
  });
});
