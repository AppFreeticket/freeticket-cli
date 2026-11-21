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
    op: "postCrmCampaigns",
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
      // WhatsApp reach of PREVIEW. Required with --yes, checked without it.
      "--expect-count",
      "7",
    ],
    write: sdk.postCrmCampaigns,
  },
  {
    name: "campaigns cancel",
    op: "postCrmCampaignsIdCancel",
    args: ["campaigns", "cancel", "cmp_1"],
    write: sdk.postCrmCampaignsIdCancel,
  },
  {
    name: "batches next",
    op: "postCrmCampaignsIdBatchesNext",
    args: ["batches", "next", "cmp_1"],
    write: sdk.postCrmCampaignsIdBatchesNext,
  },
  {
    name: "batches stop",
    op: "postCrmCampaignsIdBatchesStop",
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
    CRM_WRITES.flatMap((w) => ["", "n"].map((answer) => ({ ...w, answer }))),
  )("$name asks on a TTY and the answer $answer never sends", async ({
    args,
    write,
    answer,
  }) => {
    tty.answer = answer;
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

// ---------------------------------------------------------------------------
// No CRM write may slip past the gate: the contract's own markers and the
// source of the command are both swept, so a new write (or a refactor that
// calls the SDK directly) fails here instead of shipping unconfirmed.

describe("every CRM write the admin contract flags is covered by the gate tests", () => {
  type Op = {
    operationId?: string;
    "x-ft-destructive"?: unknown;
    "x-ft-mcp"?: { expose?: boolean };
  };
  const spec = JSON.parse(
    readFileSync(new URL("../admin-openapi.json", import.meta.url), "utf8"),
  ) as { paths: Record<string, Record<string, Op>> };
  const flagged = Object.values(spec.paths)
    .flatMap((ops) => Object.values(ops))
    .filter(
      (op) =>
        op &&
        typeof op === "object" &&
        (op["x-ft-destructive"] !== undefined ||
          op["x-ft-mcp"]?.expose === false),
    )
    .map((op) => op.operationId);

  it("finds the flagged operations (the sweep is not vacuous)", () => {
    expect(flagged.length).toBeGreaterThanOrEqual(4);
    expect(flagged.every((id) => typeof id === "string")).toBe(true);
  });

  it.each(flagged)("%s is in CRM_WRITES", (id) => {
    expect(CRM_WRITES.map((w) => w.op)).toContain(id);
  });

  it.each(CRM_WRITES)("CRM_WRITES $name mocks the SDK function $op", ({
    op,
    write,
  }) => {
    expect(write).toBe(sdk[op]);
  });
});

describe("admin-crm.ts calls every CRM write SDK function only through crmWriteOnce", () => {
  const source = readFileSync(
    new URL("./commands/admin-crm.ts", import.meta.url),
    "utf8",
  );
  // Everything after the last import statement: any mention there is a use.
  const imports = [...source.matchAll(/^import [^;]*;$/gm)];
  const last = imports.at(-1);
  const body = source.slice((last?.index ?? 0) + (last?.[0].length ?? 0));
  const uses = [...body.matchAll(/\bpostCrm\w+/g)].filter(
    (m) => m[0] !== "postCrmAudiencePreview",
  );

  it("uses each of the four writes", () => {
    expect(new Set(uses.map((m) => m[0]))).toEqual(
      new Set(CRM_WRITES.map((w) => w.op)),
    );
  });

  it.each(
    uses.map((m) => [m[0], m.index ?? 0] as const),
  )("%s (offset %i) is a call wrapped in crmWriteOnce(() =>", (name, at) => {
    const before = body.slice(0, at);
    const after = body.slice(at + name.length);
    expect(before).toMatch(/crmWriteOnce\(\(\)\s*=>\s*$/);
    expect(after).toMatch(/^\(/);
  });
});

/** TTY + credential + mocked reads, shared by the CRM blocks below. */
function crmHarness() {
  const state = {
    stderr: [] as string[],
    stdout: "",
    exit: undefined as unknown as MockInstance<typeof process.exit>,
  };
  const isTTY = process.stdin.isTTY;
  const env = { ...process.env };
  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      configurable: true,
    });
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    tty.answer = "n";
    tty.questions = [];
    tty.onAsk = undefined;
    state.stderr = [];
    state.stdout = "";
    sdk.postCrmAudiencePreview.mockResolvedValue({
      data: { data: PREVIEW },
      response: new Response(),
    });
    sdk.getCrmCampaignsId.mockResolvedValue({
      data: { data: CAMPAIGN },
      response: new Response(),
    });
    vi.spyOn(console, "error").mockImplementation((...a) => {
      state.stderr.push(a.join(" "));
    });
    vi.spyOn(console, "log").mockImplementation((...a) => {
      state.stdout += `${a.join(" ")}\n`;
    });
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      state.stdout += String(chunk);
      return true;
    });
    state.exit = vi.spyOn(process, "exit").mockImplementation((() => {
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
  return { state, run };
}

describe("ft admin crm launch --expect-count", () => {
  const { state, run } = crmHarness();
  // CRM_WRITES[0].args without its `--expect-count 7`.
  const launchArgs = CRM_WRITES[0].args.slice(0, 3);
  const created = () =>
    sdk.postCrmCampaigns.mockResolvedValue({
      data: { data: { id: "cmp_9", status: "APPROVED" } },
      response: new Response(),
    });

  it("--yes without --expect-count exits 1 and never writes", async () => {
    created();
    await expect(run(launchArgs, "--yes")).rejects.toThrow("exited");
    expect(state.exit).toHaveBeenCalledWith(1);
    expect(state.stderr.join("\n")).toMatch(/--expect-count/);
    expect(sdk.postCrmCampaigns).not.toHaveBeenCalled();
  });

  it.each([
    ["with --yes", "10"], // the total, but WhatsApp reaches 7
    ["with --yes", "8"],
    ["without --yes", "3"], // optional there, but enforced when given
  ])("%s with a count that does not match the preview (%s) exits 1 and never writes", async (yes, count) => {
    created();
    tty.answer = "y";
    await expect(
      run(
        launchArgs,
        "--expect-count",
        count,
        ...(yes === "with --yes" ? ["--yes"] : []),
      ),
    ).rejects.toThrow("exited");
    expect(state.exit).toHaveBeenCalledWith(1);
    expect(sdk.postCrmAudiencePreview).toHaveBeenCalledTimes(1);
    expect(state.stderr.join("\n")).toContain(
      `the preview reaches 7 people, --expect-count says ${count}`,
    );
    expect(tty.questions).toHaveLength(0);
    expect(sdk.postCrmCampaigns).not.toHaveBeenCalled();
  });

  it("--yes with a matching count writes exactly once", async () => {
    created();
    await run(launchArgs, "--expect-count", "7", "--yes", "--json");
    expect(state.exit).not.toHaveBeenCalled();
    expect(sdk.postCrmCampaigns).toHaveBeenCalledTimes(1);
  });

  it("without --yes, --expect-count is optional (the prompt is the gate)", async () => {
    created();
    tty.answer = "y";
    await run(launchArgs, "--json");
    expect(tty.questions).toHaveLength(1);
    expect(sdk.postCrmCampaigns).toHaveBeenCalledTimes(1);
  });

  it.each([
    "-1",
    "abc",
    "7.5",
    "",
  ])("rejects --expect-count %j before any request", async (count) => {
    await expect(
      run(launchArgs, `--expect-count=${count}`, "--yes"),
    ).rejects.toThrow("exited");
    expect(state.exit).toHaveBeenCalledWith(1);
    expect(state.stderr.join("\n")).toContain("Invalid --expect-count");
    expect(sdk.postCrmAudiencePreview).not.toHaveBeenCalled();
    expect(sdk.postCrmCampaigns).not.toHaveBeenCalled();
  });
});

describe("ft admin crm writes name the API host in the confirmation", () => {
  const { run } = crmHarness();

  it.each(CRM_WRITES)("$name asks against the configured host", async ({
    args,
    write,
  }) => {
    process.env.FT_API_URL = "https://staging.freeticket.test";
    await expect(run(args)).rejects.toThrow("exited");
    expect(tty.questions).toHaveLength(1);
    expect(tty.questions[0]).toContain("against staging.freeticket.test");
    expect(write).not.toHaveBeenCalled();
  });
});

describe("ft admin crm writes on a 2xx with an unexpected body", () => {
  const { state, run } = crmHarness();
  const odd = [
    ["an empty object", {}],
    ["null", null],
    ["a string", "Created"],
    ["data: null", { data: null }],
    ["data without an id", { data: { status: "APPROVED" } }],
  ] as const;

  it.each(
    odd,
  )("launch on %s does not crash, exits 0 and says it probably went through", async (_label, body) => {
    sdk.postCrmCampaigns.mockResolvedValue({
      data: body,
      response: new Response(null, { status: 201 }),
    });
    await expect(run(CRM_WRITES[0].args, "--yes")).resolves.toBeDefined();
    expect(state.exit).not.toHaveBeenCalled();
    expect(sdk.postCrmCampaigns).toHaveBeenCalledTimes(1);
    const err = state.stderr.join("\n");
    expect(err).toContain("PROBABLY WENT THROUGH");
    expect(err).toContain("ft admin crm campaigns list");
    expect(err).not.toContain("campaigns get undefined");
  });

  it.each(
    CRM_WRITES.slice(1),
  )("$name on a null body does not crash and says it probably went through", async ({
    args,
    write,
  }) => {
    write.mockResolvedValue({
      data: null,
      response: new Response(null, { status: 200 }),
    });
    await expect(run(args, "--yes")).resolves.toBeDefined();
    expect(state.exit).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledTimes(1);
    expect(state.stderr.join("\n")).toContain("PROBABLY WENT THROUGH");
  });
});
