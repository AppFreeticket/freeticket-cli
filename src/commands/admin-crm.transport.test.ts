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
 * No-retry at the transport level. Here the generated admin SDK and the
 * hey-api fetch client are REAL — only `globalThis.fetch` is faked — so a
 * retry added anywhere below `crmWriteOnce` (an interceptor, a client option,
 * a wrapper in the SDK) shows up as a second POST. The other CRM tests mock
 * the SDK functions and cannot see that layer.
 */

const { program } = await import("../program");

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
  status: "PROCESSING",
  senderName: "FreeTicket",
  recipientCount: 10,
  sentCount: 0,
  failedCount: 0,
  scheduledAt: null,
  nextBatchAt: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

type Call = { method: string; path: string };

describe("CRM writes reach fetch exactly once on a 503 (real admin SDK)", () => {
  const env = { ...process.env };
  let calls: Call[];
  let exit: MockInstance<typeof process.exit>;
  let stderr: string[];

  beforeEach(() => {
    process.env.FT_ADMIN_TOKEN = "ftpat_test";
    process.env.FT_API_URL = "https://admin.example.test";
    calls = [];
    stderr = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const { pathname } = new URL(req.url);
        calls.push({ method: req.method, path: pathname });
        if (
          req.method === "POST" &&
          pathname === "/api/admin/crm/audience/preview"
        )
          return json(200, { data: PREVIEW });
        if (
          req.method === "GET" &&
          pathname === "/api/admin/crm/campaigns/cmp_1"
        )
          return json(200, { data: CAMPAIGN });
        // Every write: the server is unavailable.
        return new Response("Service Unavailable", { status: 503 });
      }),
    );
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
    process.env = { ...env };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    {
      name: "launch",
      args: ["launch", "--data", campaign, "--expect-count", "7", "--yes"],
      read: { method: "POST", path: "/api/admin/crm/audience/preview" },
      write: { method: "POST", path: "/api/admin/crm/campaigns" },
    },
    {
      name: "batches next",
      args: ["batches", "next", "cmp_1", "--yes"],
      read: { method: "GET", path: "/api/admin/crm/campaigns/cmp_1" },
      write: {
        method: "POST",
        path: "/api/admin/crm/campaigns/cmp_1/batches/next",
      },
    },
  ])("$name: one read, one write, no retry", async ({ args, read, write }) => {
    await expect(
      program.parseAsync(["node", "ft", "admin", "crm", ...args]),
    ).rejects.toThrow("exited");
    expect(exit).toHaveBeenCalledWith(1);
    expect(
      calls.filter((c) => c.method === write.method && c.path === write.path),
    ).toHaveLength(1);
    // Nothing else went out: exactly the read that shows the target, then
    // the single write.
    expect(calls).toEqual([read, write]);
    expect(stderr.join("\n")).toContain("never retries");
  });
});
