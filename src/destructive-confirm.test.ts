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
/** What the fake TTY answers to the [y/N] prompt, and every prompt shown. */
const tty = vi.hoisted(() => ({
  answer: "n",
  questions: [] as string[],
  onAsk: undefined as (() => void) | undefined,
}));

vi.mock("node:readline", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:readline")>();
  const createInterface = () => ({
    question: (q: string, cb: (a: string) => void) => {
      tty.questions.push(q);
      tty.onAsk?.();
      cb(tty.answer);
    },
    close: () => {},
  });
  return { ...real, default: { ...real, createInterface }, createInterface };
});

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
    // Being in CI is not consent: only --yes is.
    process.env.CI = "true";
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

// ---------------------------------------------------------------------------
// The four CRM writes send real messages to real customers. Beyond the no-TTY
// gate above: an interactive "no" stops them, an interactive "yes" sends once,
// `launch` shows the audience size before asking, and no failure is retried.

const CRM_WRITES = [
  {
    name: "launch",
    args: [
      "launch",
      "--data",
      JSON.stringify({
        channel: "WHATSAPP",
        sender: { kind: "freeticket" },
        templateName: "promo",
        subject: "Hello",
        body: "Hi",
        filter: { version: 2, include: [], except: [] },
        timing: { mode: "now" },
      }),
    ],
    write: sdk.postCrmCampaigns,
  },
  {
    name: "campaigns cancel",
    args: ["campaigns", "cancel", "cmp_1"],
    write: sdk.postCrmCampaignsIdCancel,
  },
  {
    name: "batches next",
    args: ["batches", "next", "cmp_1"],
    write: sdk.postCrmCampaignsIdBatchesNext,
  },
  {
    name: "batches stop",
    args: ["batches", "stop", "cmp_1"],
    write: sdk.postCrmCampaignsIdBatchesStop,
  },
] as const;

describe("ft admin crm writes: confirmation, preview and no retries", () => {
  const isTTY = process.stdin.isTTY;
  const env = { ...process.env };
  let exit: MockInstance<typeof process.exit>;
  let stderr: string[];

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    tty.answer = "n";
    tty.questions = [];
    tty.onAsk = undefined;
    stderr = [];
    sdk.postCrmAudiencePreview.mockResolvedValue({
      data: { data: PREVIEW },
      response: new Response(),
    });
    sdk.getCrmCampaignsId.mockResolvedValue({
      data: { data: CAMPAIGN },
      response: new Response(),
    });
    vi.spyOn(console, "error").mockImplementation((...a) => {
      stderr.push(a.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: isTTY,
      configurable: true,
    });
    process.env = { ...env };
    vi.restoreAllMocks();
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  const run = (args: readonly string[], ...extra: string[]) =>
    program.parseAsync(["node", "ft", "admin", "crm", ...args, ...extra]);

  it.each(
    CRM_WRITES,
  )("$name asks on a TTY and an answer other than yes never sends", async ({
    args,
    write,
  }) => {
    tty.answer = "";
    await expect(run(args)).rejects.toThrow("exited");
    expect(tty.questions).toHaveLength(1);
    expect(tty.questions[0]).toMatch(/\[y\/N\] $/);
    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr).toContain("Aborted.");
    expect(write).not.toHaveBeenCalled();
  });

  it.each(
    CRM_WRITES,
  )("$name sends exactly once after an interactive yes", async ({
    args,
    write,
  }) => {
    tty.answer = "y";
    write.mockResolvedValue({
      data: { data: { id: "cmp_1", status: "APPROVED" } },
      response: new Response(),
    });
    await run(args, "--json");
    expect(tty.questions).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("launch prints the audience size before asking, and asks with the reach", async () => {
    const order: string[] = [];
    sdk.postCrmAudiencePreview.mockImplementation(async () => {
      order.push("preview");
      return { data: { data: PREVIEW }, response: new Response() };
    });
    vi.spyOn(console, "error").mockImplementation((...a) => {
      order.push(`stderr:${a.join(" ")}`);
    });
    tty.onAsk = () => order.push("ask");
    await expect(run(CRM_WRITES[0].args)).rejects.toThrow("exited");
    const askedAt = order.indexOf("ask");
    const summary = order.findIndex(
      (l) => l.includes("Audience") && l.includes("10 people"),
    );
    expect(order[0]).toBe("preview");
    expect(summary).toBeGreaterThan(0);
    expect(summary).toBeLessThan(askedAt);
    // WhatsApp: the question names who can actually be reached (7 of 10).
    expect(tty.questions[0]).toContain("Launch to 7 people by WHATSAPP");
    expect(sdk.postCrmCampaigns).not.toHaveBeenCalled();
  });

  it("launch with --yes still shows the preview (only the question is skipped)", async () => {
    sdk.postCrmCampaigns.mockResolvedValue({
      data: { data: { id: "cmp_9", status: "APPROVED" } },
      response: new Response(),
    });
    await run(CRM_WRITES[0].args, "--yes", "--json");
    expect(tty.questions).toHaveLength(0);
    expect(sdk.postCrmAudiencePreview).toHaveBeenCalledTimes(1);
    expect(stderr.join("\n")).toContain("10 people");
    expect(sdk.postCrmCampaigns).toHaveBeenCalledTimes(1);
  });

  const failures = [
    [
      "500 without an envelope",
      () => ({
        data: undefined,
        error: "Internal Server Error",
        response: new Response(null, { status: 500 }),
      }),
      /never retries/,
    ],
    [
      "503 with an envelope",
      () => ({
        data: undefined,
        error: {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "down",
            retryable: true,
          },
        },
        response: new Response(null, { status: 503 }),
      }),
      /never retries/,
    ],
    [
      "429 RATE_LIMITED",
      () => ({
        data: undefined,
        error: {
          error: {
            code: "RATE_LIMITED",
            message: "slow down",
            retryable: true,
          },
        },
        response: new Response(null, {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
      }),
      /never retries a write/,
    ],
  ] as const;

  for (const { name, args, write } of CRM_WRITES) {
    it.each(
      failures,
    )(`${name} on %s is sent once and not retried`, async (_label, response, hint) => {
      write.mockResolvedValue(response());
      await expect(run(args, "--yes")).rejects.toThrow("exited");
      expect(exit).toHaveBeenCalledWith(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(stderr.join("\n")).toMatch(hint);
      expect(stderr.join("\n")).not.toMatch(/retry with backoff/i);
    });

    it(`${name} on a dropped connection is sent once and reports the outcome as unknown`, async () => {
      write.mockRejectedValue(new TypeError("fetch failed"));
      await expect(run(args, "--yes")).rejects.toThrow("exited");
      expect(write).toHaveBeenCalledTimes(1);
      const err = stderr.join("\n");
      expect(err).toContain("fetch failed");
      expect(err).toContain("may or may not have gone through");
    });
  }
});
