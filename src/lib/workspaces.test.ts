import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getMe } from "../client/sdk.gen";
import { listTargets, splitLimit } from "./api";

vi.mock("../client/sdk.gen", () => ({ getMe: vi.fn() }));
// The real one reads ~/.freeticket/config.json, so on a developer machine with
// a workspace already pinned every fan-out test would pass for the wrong reason.
vi.mock("./config", () => ({
  loadConfig: () => ({
    apiUrl: "http://localhost",
    workspaceId: process.env.FT_WORKSPACE_ID,
  }),
}));

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
