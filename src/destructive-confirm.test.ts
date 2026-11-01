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
  deleteWorkspacesId: vi.fn(),
  deleteEventsIdArtistsOrganizationId: vi.fn(),
  deleteEventsIdArtistInvitationsInvitationId: vi.fn(),
  deletePresaleWindowsId: vi.fn(),
  postSalesIdItemsItemIdTransfer: vi.fn(),
  patchSalesIdRecipient: vi.fn(),
  deleteTicketsTicketCodeCheckin: vi.fn(),
}));

vi.mock("./client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client/sdk.gen")>()),
  postEventsIdCancel: sdk.postEventsIdCancel,
  deleteStaffId: sdk.deleteStaffId,
  deleteEventsIdArtistsOrganizationId: sdk.deleteEventsIdArtistsOrganizationId,
  deleteEventsIdArtistInvitationsInvitationId:
    sdk.deleteEventsIdArtistInvitationsInvitationId,
  deletePresaleWindowsId: sdk.deletePresaleWindowsId,
  postSalesIdItemsItemIdTransfer: sdk.postSalesIdItemsItemIdTransfer,
  patchSalesIdRecipient: sdk.patchSalesIdRecipient,
  deleteTicketsTicketCodeCheckin: sdk.deleteTicketsTicketCodeCheckin,
}));

vi.mock("./admin-client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin-client/sdk.gen")>()),
  deleteWorkspacesId: sdk.deleteWorkspacesId,
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
];
