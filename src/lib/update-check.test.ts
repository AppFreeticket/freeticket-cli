import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, isNewer, updateCheckDisabled } from "./update-check";

/**
 * Network/cache path of the update notice. CACHE_PATH is computed from
 * homedir() at import time, so node:os is mocked (hoisted above the import)
 * to a throwaway dir: these tests never touch the real ~/.freeticket.
 * `fetch` is stubbed; no request leaves the machine.
 */
vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:os")>();
  const { mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(actual.tmpdir(), "ft-update-check-"));
  return { ...actual, homedir: () => dir };
});

const CACHE_DIR = join(homedir(), ".freeticket");
const CACHE_FILE = join(CACHE_DIR, "update-check.json");
const ARGV = ["node", "ft", "events", "list"];
const ONE_DAY = 24 * 60 * 60 * 1000;

function writeCache(at: number, latest: string): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify({ at, latest }));
}

function okResponse(version: string): Response {
  return { ok: true, status: 200, json: async () => ({ version }) } as Response;
}

describe("isNewer", () => {
  it("detects newer versions across each semver field", () => {
    expect(isNewer("0.7.0", "0.6.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(true);
    expect(isNewer("0.6.1", "0.6.0")).toBe(true);
  });

  it("is false for equal or older versions", () => {
    expect(isNewer("0.6.0", "0.6.0")).toBe(false);
    expect(isNewer("0.5.9", "0.6.0")).toBe(false);
    expect(isNewer("0.6.0", "0.6.1")).toBe(false);
  });

  it("ignores a leading v and prerelease tags", () => {
    expect(isNewer("v0.7.0", "0.6.0")).toBe(true);
    expect(isNewer("0.7.0-beta.1", "0.7.0")).toBe(false);
  });
});

describe("updateCheckDisabled", () => {
  const argv = ["node", "ft", "events", "list"];

  it("checks in an interactive terminal with human output", () => {
    expect(updateCheckDisabled(argv, {}, true)).toBe(false);
  });

  it("stays quiet without a TTY, in CI, or when opted out", () => {
    expect(updateCheckDisabled(argv, {}, false)).toBe(true);
    expect(updateCheckDisabled(argv, { CI: "true" }, true)).toBe(true);
    expect(updateCheckDisabled(argv, { FT_NO_UPDATE_CHECK: "1" }, true)).toBe(
      true,
    );
  });

  it("stays quiet when the output is for a machine", () => {
    for (const flag of ["--json", "--raw", "--csv"])
      expect(updateCheckDisabled([...argv, flag], {}, true)).toBe(true);
  });
});

describe("checkForUpdate (registry + cache)", () => {
  const tty = process.stderr.isTTY;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    rmSync(CACHE_DIR, { recursive: true, force: true });
    vi.stubEnv("CI", "");
    vi.stubEnv("FT_NO_UPDATE_CHECK", "");
    Object.defineProperty(process.stderr, "isTTY", {
      value: true,
      configurable: true,
    });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    Object.defineProperty(process.stderr, "isTTY", {
      value: tty,
      configurable: true,
    });
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks the registry for plain application/json (the abbreviated npm type gets 406)", async () => {
    fetchMock.mockResolvedValue(okResponse("99.0.0"));
    const notice = await checkForUpdate("0.1.0", ARGV);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://registry.npmjs.org/@freeticket/cli/latest");
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(notice).toContain("99.0.0");
  });

  it("returns null without throwing when fetch rejects", async () => {
    fetchMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(checkForUpdate("0.1.0", ARGV)).resolves.toBeNull();
  });

  it("returns null when the registry answers non-ok", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 406 } as Response);
    await expect(checkForUpdate("0.1.0", ARGV)).resolves.toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);
    await expect(checkForUpdate("0.1.0", ARGV)).resolves.toBeNull();
  });

  it("serves a fresh cache without hitting the registry", async () => {
    writeCache(Date.now() - 60_000, "42.0.0");
    const notice = await checkForUpdate("0.1.0", ARGV);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notice).toContain("42.0.0");
  });

  it("re-checks when the cache is older than a day", async () => {
    writeCache(Date.now() - ONE_DAY - 60_000, "42.0.0");
    fetchMock.mockResolvedValue(okResponse("43.0.0"));
    const notice = await checkForUpdate("0.1.0", ARGV);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notice).toContain("43.0.0");
  });

  it("treats a cache stamped in the future as stale, not fresh forever", async () => {
    writeCache(Date.now() + 365 * ONE_DAY, "42.0.0");
    fetchMock.mockResolvedValue(okResponse("43.0.0"));
    const notice = await checkForUpdate("0.1.0", ARGV);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notice).toContain("43.0.0");
  });
});
