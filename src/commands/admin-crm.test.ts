import { Command } from "commander";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

const sdk = vi.hoisted(() => ({
  getCrmCampaigns: vi.fn(),
  getCrmCampaignsId: vi.fn(),
  getCrmEvents: vi.fn(),
  getCrmEventDates: vi.fn(),
  postCrmAudiencePreview: vi.fn(),
  postCrmCampaigns: vi.fn(),
  postCrmCampaignsIdBatchesNext: vi.fn(),
}));

vi.mock("../admin-client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../admin-client/sdk.gen")>()),
  ...sdk,
}));

const { crmErrorHint, describeWhen, parseSender, previewSummary } =
  await import("./admin-crm");
const { registerAdmin } = await import("./admin");

const PREVIEW = {
  counts: {
    matched: 120,
    excludedByExcept: 5,
    excludedByFrequency: 3,
    suppressed: 2,
    total: 110,
    reachableWhatsapp: 80,
    withoutPhone: 30,
  },
  sample: [],
  involvedWorkspaceIds: ["ws_1"],
  senderChoice: {
    forced: false as const,
    organization: { id: "ws_1", name: "Teatro", logoUrl: null },
  },
  whatsappEstimate: { days: 2, dailyCap: 50, remainingToday: 30 },
};

const CAMPAIGN = {
  id: "cmp_1",
  subject: "Hello",
  channel: "WHATSAPP",
  status: "PROCESSING",
  senderName: "FreeTicket",
  recipientCount: 110,
  sentCount: 40,
  failedCount: 0,
  scheduledAt: null,
  nextBatchAt: "2026-11-03T14:00:00.000Z",
};

const ok = (data: unknown) => ({ data: { data }, response: new Response() });
const apiError = (
  status: number,
  error: Record<string, unknown>,
  headers: Record<string, string> = {},
) => ({
  data: undefined,
  error: { error: { retryable: false, ...error } },
  response: new Response(null, { status, headers }),
});

function build(): Command {
  const program = new Command();
  program.exitOverride();
  registerAdmin(program);
  return program;
}

function crmTree(): Command {
  const admin = build().commands.find((c) => c.name() === "admin") as Command;
  return admin.commands.find((c) => c.name() === "crm") as Command;
}

describe("ft admin crm command tree", () => {
  it("registers every documented subcommand", () => {
    const crm = crmTree();
    const names = (c: Command) => c.commands.map((s) => s.name()).sort();
    expect(names(crm)).toEqual([
      "batches",
      "campaigns",
      "events",
      "launch",
      "options",
      "preview",
      "quota",
    ]);
    const sub = (n: string) =>
      crm.commands.find((c) => c.name() === n) as Command;
    expect(names(sub("campaigns"))).toEqual(["cancel", "get", "list"]);
    expect(names(sub("batches"))).toEqual(["next", "stop"]);
    expect(names(sub("events"))).toEqual(["dates", "search"]);
  });

  it("puts every write behind --yes", () => {
    const crm = crmTree();
    const find = (path: string[]) =>
      path.reduce<Command>(
        (c, n) => c.commands.find((s) => s.name() === n) as Command,
        crm,
      );
    for (const p of [
      ["launch"],
      ["campaigns", "cancel"],
      ["batches", "next"],
      ["batches", "stop"],
    ])
      expect(find(p).options.map((o) => o.long)).toContain("--yes");
    expect(find(["batches", "next"]).options.map((o) => o.long)).toContain(
      "--ignore-window",
    );
  });
});

describe("ft admin crm commands", () => {
  const env = { ...process.env };
  let stdout: string;
  let stderr: string[];
  let exit: MockInstance<typeof process.exit>;

  beforeEach(() => {
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    stdout = "";
    stderr = [];
    vi.spyOn(process.stdout, "write").mockImplementation(
      (chunk: string | Uint8Array) => {
        stdout += String(chunk);
        return true;
      },
    );
    vi.spyOn(console, "log").mockImplementation((...a) => {
      stdout += `${a.join(" ")}\n`;
    });
    vi.spyOn(console, "error").mockImplementation((...a) => {
      stderr.push(a.join(" "));
    });
    exit = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  const run = (...args: string[]) =>
    build().parseAsync(["node", "ft", "admin", "crm", ...args]);

  it("campaigns list passes the filters through, upper-cased", async () => {
    sdk.getCrmCampaigns.mockResolvedValue(ok([CAMPAIGN]));
    await run(
      "campaigns",
      "list",
      "--channel",
      "whatsapp",
      "--status",
      "scheduled",
      "--limit",
      "5",
      "--json",
    );
    expect(sdk.getCrmCampaigns).toHaveBeenCalledWith({
      query: { channel: "WHATSAPP", status: "SCHEDULED", limit: 5 },
    });
    expect(JSON.parse(stdout)).toEqual([CAMPAIGN]);
  });

  it("events search sends query, purpose and the sender workspace", async () => {
    sdk.getCrmEvents.mockResolvedValue(ok([]));
    await run(
      "events",
      "search",
      "stand up",
      "--purpose",
      "promote",
      "--sender",
      "ws_1",
      "--json",
    );
    expect(sdk.getCrmEvents).toHaveBeenCalledWith({
      query: {
        query: "stand up",
        purpose: "promote",
        senderWorkspaceId: "ws_1",
      },
    });
  });

  it("events search defaults --purpose to scope", async () => {
    sdk.getCrmEvents.mockResolvedValue(ok([]));
    await run("events", "search", "jazz", "--json");
    expect(sdk.getCrmEvents.mock.calls[0]?.[0].query.purpose).toBe("scope");
  });

  it("events dates joins every id (spaces or commas) into eventIds", async () => {
    sdk.getCrmEventDates.mockResolvedValue(ok([]));
    await run("events", "dates", "evt_1", "evt_2,evt_3", "--json");
    expect(sdk.getCrmEventDates).toHaveBeenCalledWith({
      query: { eventIds: "evt_1,evt_2,evt_3" },
    });
  });

  it("preview maps --sender to the contract shape", async () => {
    sdk.postCrmAudiencePreview.mockResolvedValue(ok(PREVIEW));
    const filter = { version: 2, include: [], except: [] };
    await run(
      "preview",
      "--filter",
      JSON.stringify(filter),
      "--sender",
      "ws_1",
      "--json",
    );
    expect(sdk.postCrmAudiencePreview).toHaveBeenCalledWith({
      body: { filter, sender: { kind: "organization", workspaceId: "ws_1" } },
    });
  });

  it("launch --yes previews with the same filter and sender, then posts once", async () => {
    sdk.postCrmAudiencePreview.mockResolvedValue(ok(PREVIEW));
    sdk.postCrmCampaigns.mockResolvedValue(
      ok({ id: "cmp_9", status: "APPROVED", scheduledAt: null }),
    );
    const input = {
      channel: "WHATSAPP",
      sender: { kind: "freeticket" },
      templateName: "promo",
      subject: "Hello",
      body: "Hi",
      filter: {
        version: 2,
        include: [{ type: "purchased", eventIds: ["evt_1"] }],
        except: [],
      },
      timing: { mode: "now" },
    };
    await run("launch", "--data", JSON.stringify(input), "--yes", "--json");
    expect(sdk.postCrmAudiencePreview).toHaveBeenCalledWith({
      body: { filter: input.filter, sender: input.sender },
    });
    expect(sdk.postCrmCampaigns).toHaveBeenCalledTimes(1);
    expect(sdk.postCrmCampaigns).toHaveBeenCalledWith({ body: input });
    // Preview went to stderr; stdout is the launch result only.
    expect(stderr.join("\n")).toContain("reachable by WhatsApp: 80");
    expect(stderr.join("\n")).toContain("~2 day(s)");
    expect(JSON.parse(stdout)).toEqual({
      id: "cmp_9",
      status: "APPROVED",
      scheduledAt: null,
    });
  });

  it("launch stops on an empty audience without posting", async () => {
    sdk.postCrmAudiencePreview.mockResolvedValue(
      ok({ ...PREVIEW, counts: { ...PREVIEW.counts, total: 0 } }),
    );
    await expect(
      run(
        "launch",
        "--data",
        JSON.stringify({ filter: { version: 2 } }),
        "--yes",
      ),
    ).rejects.toThrow("exited");
    expect(sdk.postCrmCampaigns).not.toHaveBeenCalled();
  });

  it("launch shows the existing id on DUPLICATE_CAMPAIGN and does not retry", async () => {
    sdk.postCrmAudiencePreview.mockResolvedValue(ok(PREVIEW));
    sdk.postCrmCampaigns.mockResolvedValue(
      apiError(409, {
        code: "DUPLICATE_CAMPAIGN",
        message: "Ya lanzaste esta campaña.",
        details: { existingId: "cmp_old" },
      }),
    );
    await expect(
      run(
        "launch",
        "--data",
        JSON.stringify({ filter: { version: 2 }, channel: "EMAIL" }),
        "--yes",
      ),
    ).rejects.toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(sdk.postCrmCampaigns).toHaveBeenCalledTimes(1);
    const err = stderr.join("\n");
    expect(err).toContain("[DUPLICATE_CAMPAIGN]");
    expect(err).toContain("ft admin crm campaigns get cmp_old");
  });

  it("batches next --ignore-window sends ignoreSendWindow", async () => {
    sdk.getCrmCampaignsId.mockResolvedValue(ok(CAMPAIGN));
    sdk.postCrmCampaignsIdBatchesNext.mockResolvedValue(ok({ batch: 50 }));
    await run("batches", "next", "cmp_1", "--ignore-window", "--yes", "--json");
    expect(sdk.postCrmCampaignsIdBatchesNext).toHaveBeenCalledWith({
      path: { id: "cmp_1" },
      body: { ignoreSendWindow: true },
    });
  });

  it("batches next without the flag sends no body", async () => {
    sdk.getCrmCampaignsId.mockResolvedValue(ok(CAMPAIGN));
    sdk.postCrmCampaignsIdBatchesNext.mockResolvedValue(ok({ batch: 50 }));
    await run("batches", "next", "cmp_1", "--yes", "--json");
    expect(sdk.postCrmCampaignsIdBatchesNext).toHaveBeenCalledWith({
      path: { id: "cmp_1" },
    });
  });

  it("OUTSIDE_SEND_WINDOW says when it opens and suggests --ignore-window, once", async () => {
    sdk.getCrmCampaignsId.mockResolvedValue(ok(CAMPAIGN));
    sdk.postCrmCampaignsIdBatchesNext.mockResolvedValue(
      apiError(
        409,
        {
          code: "OUTSIDE_SEND_WINDOW",
          message: "Fuera de la ventana de envío.",
          retryable: true,
        },
        { "Retry-After": "3600" },
      ),
    );
    await expect(run("batches", "next", "cmp_1", "--yes")).rejects.toThrow(
      "exited",
    );
    expect(sdk.postCrmCampaignsIdBatchesNext).toHaveBeenCalledTimes(1);
    const err = stderr.join("\n");
    expect(err).toContain("[OUTSIDE_SEND_WINDOW]");
    expect(err).toContain("opens");
    expect(err).toContain("in 1h 0m");
    expect(err).toContain("--ignore-window");
  });

  it("422 lists details[].path", async () => {
    sdk.postCrmAudiencePreview.mockResolvedValue(
      apiError(422, {
        code: "VALIDATION_ERROR",
        message: "Filtro inválido.",
        details: [{ path: "filter.scope.level", message: "Invalid input" }],
      }),
    );
    await expect(
      run("preview", "--filter", '{"version":2,"scope":{"level":"x"}}'),
    ).rejects.toThrow("exited");
    expect(stderr.join("\n")).toContain("· filter.scope.level: Invalid input");
  });
});

describe("helpers", () => {
  it("parseSender", () => {
    expect(parseSender("freeticket")).toEqual({ kind: "freeticket" });
    expect(parseSender("FreeTicket")).toEqual({ kind: "freeticket" });
    expect(parseSender("ws_1")).toEqual({
      kind: "organization",
      workspaceId: "ws_1",
    });
  });

  it("describeWhen renders Bogotá time and the delay", () => {
    const now = Date.parse("2026-11-03T02:00:00.000Z"); // 21:00 Bogotá
    const s = describeWhen(12 * 3600, now); // 09:00 Bogotá
    expect(s).toContain("9:00 AM (Bogotá)");
    expect(s).toContain("in 12h 0m");
    expect(s).toContain("2026-11-03T14:00:00.000Z");
  });

  it("crmErrorHint names QUOTA_EXHAUSTED and leaves unknown codes alone", () => {
    expect(crmErrorHint({ code: "QUOTA_EXHAUSTED" }, 60)).toContain(
      "quota is used up",
    );
    expect(crmErrorHint({ code: "NOT_FOUND" }, undefined)).toBeNull();
  });

  it("previewSummary leaves out the WhatsApp estimate for email", () => {
    const email = previewSummary(PREVIEW, "EMAIL").join("\n");
    expect(email).toContain("110 people");
    expect(email).not.toContain("day(s)");
    expect(email).toContain("Teatro (ws_1)");
  });
});
