import { readFileSync } from "node:fs";
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
    exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: tty,
      configurable: true,
    });
    vi.restoreAllMocks();
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
];
