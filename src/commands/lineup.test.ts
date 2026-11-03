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
  getEventsId: vi.fn(),
  putEventsIdArtists: vi.fn(),
  getArtists: vi.fn(),
}));

vi.mock("../client/sdk.gen", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../client/sdk.gen")>()),
  ...sdk,
}));

vi.mock("../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/api")>()),
  configureClient: vi.fn(),
}));

const { registerArtists, registerEventLineup } = await import("./lineup");

const ok = (data: unknown, extra: Record<string, unknown> = {}) => ({
  data: { data, ...extra },
  response: new Response(),
});

function build(): Command {
  const program = new Command().exitOverride();
  registerEventLineup(program.command("events"));
  registerArtists(program);
  return program;
}

const run = (...args: string[]) => build().parseAsync(["node", "ft", ...args]);

describe("ft events artists set", () => {
  const tty = process.stdin.isTTY;
  let stderr: MockInstance<typeof console.error>;

  beforeEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      configurable: true,
    });
    stderr = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("exited");
    }) as never);
    sdk.putEventsIdArtists.mockResolvedValue(ok({ artists: [] }));
  });

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: tty,
      configurable: true,
    });
    vi.restoreAllMocks();
    for (const fn of Object.values(sdk)) fn.mockReset();
  });

  it("sends the full lineup in order and skips confirmation when nobody drops out", async () => {
    sdk.getEventsId.mockResolvedValue(
      ok({ artists: [{ id: "a1", name: "Uno" }] }),
    );
    await run("events", "artists", "set", "evt_1", "--artist", "a2", "a1");
    expect(sdk.putEventsIdArtists).toHaveBeenCalledWith({
      path: { id: "evt_1" },
      body: { artistIds: ["a2", "a1"], inviteEmails: undefined },
    });
  });

  it("refuses without --yes when an artist would be removed, naming them", async () => {
    sdk.getEventsId.mockResolvedValue(
      ok({ artists: [{ id: "a1", name: "Uno" }] }),
    );
    await expect(
      run("events", "artists", "set", "evt_1", "--artist", "a2"),
    ).rejects.toThrow("exited");
    expect(stderr.mock.calls[0]?.[0]).toMatch(/Refusing: Remove Uno/);
    expect(sdk.putEventsIdArtists).not.toHaveBeenCalled();
  });

  it("refuses to clear the lineup without --yes, even if it is already empty", async () => {
    sdk.getEventsId.mockResolvedValue(ok({ artists: [] }));
    await expect(run("events", "artists", "set", "evt_1")).rejects.toThrow(
      "exited",
    );
    expect(sdk.putEventsIdArtists).not.toHaveBeenCalled();
  });

  it("--yes skips the lookup and prints ARTIST_IDS_IGNORED warnings", async () => {
    sdk.putEventsIdArtists.mockResolvedValue(
      ok(
        { artists: [] },
        {
          warnings: [
            { code: "ARTIST_IDS_IGNORED", message: "Ignored", ids: ["bad"] },
          ],
        },
      ),
    );
    await run(
      "events",
      "artists",
      "set",
      "evt_1",
      "--artist",
      "bad",
      "--invite",
      "x@y.co",
      "--yes",
    );
    expect(sdk.getEventsId).not.toHaveBeenCalled();
    expect(sdk.putEventsIdArtists).toHaveBeenCalledWith({
      path: { id: "evt_1" },
      body: { artistIds: ["bad"], inviteEmails: ["x@y.co"] },
    });
    expect(stderr.mock.calls[0]?.[0]).toMatch(/ARTIST_IDS_IGNORED.*bad/);
  });

  it("artists search passes q, limit and cursor", async () => {
    sdk.getArtists.mockResolvedValue(
      ok([], { page: { nextCursor: null, hasMore: false } }),
    );
    await run("artists", "search", "bad bunny", "--limit", "5", "--json");
    expect(sdk.getArtists).toHaveBeenCalledWith({
      query: { q: "bad bunny", limit: 5, cursor: undefined },
    });
  });
});

describe("lineup command tree", () => {
  it("registers artists set|remove and invitations list|resend|cancel under events", () => {
    const events = build().commands.find((c) => c.name() === "events");
    const sub = (n: string) =>
      events?.commands
        .find((c) => c.name() === n)
        ?.commands.map((c) => c.name())
        .sort();
    expect(sub("artists")).toEqual(["remove", "set"]);
    expect(sub("invitations")).toEqual(["cancel", "list", "resend"]);
  });
});
