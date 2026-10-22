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
  // CRM writes, plus the reads they show before confirming.
  postCrmCampaigns: vi.fn(),
  postCrmCampaignsIdCancel: vi.fn(),
  postCrmCampaignsIdBatchesNext: vi.fn(),
  postCrmCampaignsIdBatchesStop: vi.fn(),
  postCrmAudiencePreview: vi.fn(),
  getCrmCampaignsId: vi.fn(),
}));

const PREVIEW = {
  counts: {
    matched: 12,
    excludedByExcept: 1,
    excludedByFrequency: 0,
    suppressed: 1,
    total: 10,
    reachableWhatsapp: 7,
    withoutPhone: 3,
  },
  sample: [],
  involvedWorkspaceIds: ["ws_1"],
  senderChoice: { forced: true },
  whatsappEstimate: { days: 1, dailyCap: 150, remainingToday: 150 },
};

const CAMPAIGN = {
  id: "cmp_1",
  subject: "Hello",
  channel: "WHATSAPP",
  status: "SCHEDULED",
  senderName: "FreeTicket",
  recipientCount: 10,
  sentCount: 0,
  failedCount: 0,
  scheduledAt: null,
  nextBatchAt: null,
};

vi.mock("./client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./client/sdk.gen")>()),
  postEventsIdCancel: sdk.postEventsIdCancel,
  deleteStaffId: sdk.deleteStaffId,
}));

vi.mock("./admin-client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./admin-client/sdk.gen")>()),
  deleteWorkspacesId: sdk.deleteWorkspacesId,
  postCrmCampaigns: sdk.postCrmCampaigns,
  postCrmCampaignsIdCancel: sdk.postCrmCampaignsIdCancel,
  postCrmCampaignsIdBatchesNext: sdk.postCrmCampaignsIdBatchesNext,
  postCrmCampaignsIdBatchesStop: sdk.postCrmCampaignsIdBatchesStop,
  postCrmAudiencePreview: sdk.postCrmAudiencePreview,
  getCrmCampaignsId: sdk.getCrmCampaignsId,
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

  it.each([
    [["events", "cancel", "evt_1"], sdk.postEventsIdCancel],
    [["staff", "delete", "stf_1"], sdk.deleteStaffId],
    [["admin", "workspaces", "delete", "ws_1"], sdk.deleteWorkspacesId],
  ])("ft %j exits 1 and never calls the SDK", async (args, fn) => {
    await expect(
      program.parseAsync(["node", "ft", ...(args as string[])]),
    ).rejects.toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    // The exit must come from the confirmation gate, not e.g. "Not logged in".
    expect(stderr.mock.calls[0]?.[0]).toMatch(/^Refusing: .*no TTY to confirm/);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("ft admin crm writes refuse without a TTY and without --yes", () => {
  const tty = process.stdin.isTTY;
  const env = { ...process.env };
  let exit: MockInstance<typeof process.exit>;
  let stderr: MockInstance<typeof console.error>;

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    // The CRM shows what it is about to touch before asking, so it needs a
    // credential to get that far. The reads are mocked; nothing leaves.
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    sdk.postCrmAudiencePreview.mockResolvedValue({
      data: { data: PREVIEW },
      response: new Response(),
    });
    sdk.getCrmCampaignsId.mockResolvedValue({
      data: { data: CAMPAIGN },
      response: new Response(),
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
    process.env = { ...env };
    vi.restoreAllMocks();
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  const campaign = JSON.stringify({
    channel: "WHATSAPP",
    sender: { kind: "freeticket" },
    templateName: "promo",
    subject: "Hello",
    body: "Hi",
    filter: { version: 2, include: [], except: [] },
    timing: { mode: "now" },
  });

  it.each([
    [
      ["launch", "--data", campaign],
      sdk.postCrmCampaigns,
      sdk.postCrmAudiencePreview,
    ],
    [
      ["campaigns", "cancel", "cmp_1"],
      sdk.postCrmCampaignsIdCancel,
      sdk.getCrmCampaignsId,
    ],
    [
      ["batches", "next", "cmp_1"],
      sdk.postCrmCampaignsIdBatchesNext,
      sdk.getCrmCampaignsId,
    ],
    [
      ["batches", "stop", "cmp_1"],
      sdk.postCrmCampaignsIdBatchesStop,
      sdk.getCrmCampaignsId,
    ],
  ])("ft admin crm %j exits 1 and never calls the write", async (args, write, read) => {
    await expect(
      program.parseAsync(["node", "ft", "admin", "crm", ...(args as string[])]),
    ).rejects.toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    // It got as far as showing the target (preview / campaign)...
    expect(read).toHaveBeenCalledTimes(1);
    // ...and the exit is the confirmation gate, not anything earlier.
    const messages = stderr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => /^Refusing: .*no TTY to confirm/.test(m))).toBe(
      true,
    );
    expect(write).not.toHaveBeenCalled();
  });
});
