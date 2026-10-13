import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getMe } from "../client/sdk.gen";
import {
  expandTargets,
  listTargets,
  resolveAccount,
  setAccountFlag,
  splitLimit,
} from "./api";
import type { ResolvedAccount } from "./config";

vi.mock("../client/sdk.gen", () => ({ getMe: vi.fn() }));
// The real one reads ~/.freeticket/config.json, so on a developer machine with
// a workspace already pinned every fan-out test would pass for the wrong reason.
let stored: ResolvedAccount[] = [];
vi.mock("./config", () => ({
  loadConfig: () => ({ apiUrl: "http://localhost" }),
  effectiveAccounts: (flag?: string) => {
    const all = stored.map((a) => ({
      ...a,
      workspaceId: process.env.FT_WORKSPACE_ID ?? a.workspaceId,
    }));
    return flag ? all.filter((a) => a.name === flag) : all;
  },
}));

const acct = (name: string, workspaceId?: string): ResolvedAccount => ({
  name,
  apiUrl: "http://localhost",
  apiKey: `key-${name}`,
  workspaceId,
});

const me = (
  workspaces: { id: string; name: string; sections?: string[] | null }[],
) => ({
  data: {
    data: {
      workspaces: workspaces.map((w) => ({ sections: null, ...w })),
    },
  },
});

const saved = { ...process.env };
beforeEach(() => {
  process.env.FT_WORKSPACE_ID = undefined;
  delete process.env.FT_WORKSPACE_ID;
  vi.mocked(getMe).mockReset();
  stored = [acct("solo")];
  setAccountFlag(undefined);
});
afterEach(() => {
  process.env = { ...saved };
});

describe("listTargets", () => {
  test("an unpinned session reaching several workspaces reads all of them", async () => {
    vi.mocked(getMe).mockResolvedValue(
      me([
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ]) as never,
    );
    const targets = await listTargets(undefined);
    expect(targets?.map((w) => w.id)).toEqual(["a", "b"]);
  });

  test("--workspace pins it: no fan-out, and /me is never asked", async () => {
    expect(await listTargets("a")).toBeNull();
    expect(getMe).not.toHaveBeenCalled();
  });

  test("a pinned session pins it too", async () => {
    process.env.FT_WORKSPACE_ID = "a";
    expect(await listTargets(undefined)).toBeNull();
    expect(getMe).not.toHaveBeenCalled();
  });

  test("workspaces with revoked access are not queried for a 403", async () => {
    vi.mocked(getMe).mockResolvedValue(
      me([
        { id: "a", name: "A" },
        { id: "b", name: "B", sections: [] },
        { id: "c", name: "C", sections: ["events"] },
      ]) as never,
    );
    expect((await listTargets(undefined))?.map((w) => w.id)).toEqual([
      "a",
      "c",
    ]);
  });

  test("one workspace, or a /me that cannot be read, stays on the single call", async () => {
    vi.mocked(getMe).mockResolvedValue(me([{ id: "a", name: "A" }]) as never);
    expect(await listTargets(undefined)).toBeNull();
    // An unreachable /me must not read as "you have no workspaces".
    vi.mocked(getMe).mockResolvedValue({ error: { code: "boom" } } as never);
    expect(await listTargets(undefined)).toBeNull();
  });
});

describe("listTargets across accounts", () => {
  test("every account × every workspace, a shared workspace read once", async () => {
    stored = [acct("a@x.com"), acct("b@x.com")];
    vi.mocked(getMe)
      .mockResolvedValueOnce(
        me([
          { id: "w1", name: "One" },
          { id: "shared", name: "Shared" },
        ]) as never,
      )
      .mockResolvedValueOnce(
        me([
          { id: "shared", name: "Shared" },
          { id: "w2", name: "Two" },
        ]) as never,
      );
    const targets = await listTargets(undefined);
    expect(targets?.map((t) => [t.account.name, t.id])).toEqual([
      ["a@x.com", "w1"],
      // First account wins: b@x.com does not query it a second time.
      ["a@x.com", "shared"],
      ["b@x.com", "w2"],
    ]);
  });

  test("an account whose /me fails is skipped, the others still answer", async () => {
    stored = [acct("a"), acct("b")];
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getMe)
      .mockResolvedValueOnce({
        error: { error: { code: "UNAUTHORIZED" } },
      } as never)
      .mockResolvedValueOnce(
        me([
          { id: "w1", name: "One" },
          { id: "w2", name: "Two" },
        ]) as never,
      );
    const targets = await listTargets(undefined);
    expect(targets?.map((t) => t.id)).toEqual(["w1", "w2"]);
    expect(err.mock.calls.flat().join(" ")).toContain("account a");
    err.mockRestore();
  });

  test("--workspace picks the one account that reaches it: a single call", async () => {
    stored = [acct("a"), acct("b")];
    vi.mocked(getMe)
      .mockResolvedValueOnce(me([{ id: "w1", name: "One" }]) as never)
      .mockResolvedValueOnce(me([{ id: "w2", name: "Two" }]) as never);
    expect(await listTargets("w2")).toBeNull();
  });

  test("--account narrows the fan-out to that account", async () => {
    stored = [acct("a"), acct("b")];
    setAccountFlag("b");
    vi.mocked(getMe).mockResolvedValue(
      me([
        { id: "w1", name: "One" },
        { id: "w2", name: "Two" },
      ]) as never,
    );
    const targets = await listTargets(undefined);
    expect(new Set(targets?.map((t) => t.account.name))).toEqual(
      new Set(["b"]),
    );
    expect(getMe).toHaveBeenCalledTimes(1);
  });
});

describe("expandTargets", () => {
  test("an account pinned to a workspace contributes only that one", () => {
    const out = expandTargets([
      {
        account: acct("a", "w2"),
        workspaces: [
          { id: "w1", name: "One", sections: null },
          { id: "w2", name: "Two", sections: null },
        ],
      },
      {
        account: acct("b"),
        workspaces: [{ id: "w3", name: "Three", sections: null }],
      },
    ]);
    expect(out.map((t) => t.id)).toEqual(["w2", "w3"]);
  });
});

describe("resolveAccount", () => {
  test("one account in scope is used as is", () => {
    expect(resolveAccount().name).toBe("solo");
  });

  test("several and none chosen: fails instead of guessing", () => {
    stored = [acct("a"), acct("b")];
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => resolveAccount()).toThrow("exit");
    const said = err.mock.calls.flat().join("\n");
    expect(said).toContain("a, b");
    expect(said).toContain("--account <name>");
    exit.mockRestore();
    err.mockRestore();
  });

  test("--account resolves the ambiguity", () => {
    stored = [acct("a"), acct("b")];
    setAccountFlag("b");
    expect(resolveAccount().name).toBe("b");
  });
});

describe("splitLimit", () => {
  test("spreads the limit so the aggregate is what was asked for", () => {
    expect(splitLimit(20, 4)).toBe(5);
    // Rounds up: nobody gets a page of zero rows.
    expect(splitLimit(3, 4)).toBe(1);
  });

  test("a single target or a nonsense limit is left alone", () => {
    expect(splitLimit(20, 1)).toBe(20);
    expect(splitLimit(Number.NaN, 4)).toBeNaN();
  });
});
