import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { loadConfig, migrate, resolveAccounts } from "./config";

const saved = { ...process.env };
beforeEach(() => {
  delete process.env.FT_API_URL;
  delete process.env.FT_API_KEY;
  delete process.env.FT_WORKSPACE_ID;
});
afterEach(() => {
  process.env = { ...saved };
});

test("env vars toman precedencia y se resuelven", () => {
  process.env.FT_API_URL = "http://admin.localhost:3000";
  process.env.FT_API_KEY = "ft_live_test";
  process.env.FT_WORKSPACE_ID = "org_123";
  const cfg = loadConfig();
  expect(cfg).toEqual({
    apiUrl: "http://admin.localhost:3000",
    apiKey: "ft_live_test",
    workspaceId: "org_123",
  });
});

test("apiUrl cae al default cuando no hay env ni archivo", () => {
  // Asume sin ~/.freeticket/config.json en el entorno de CI.
  const cfg = loadConfig();
  expect(cfg.apiUrl).toBe("https://admin.appfreeticket.com");
});

describe("migrate", () => {
  test("a legacy single-account file reads as the account `default`", () => {
    expect(
      migrate({ apiUrl: "http://x", apiKey: "k1", workspaceId: "ws" }),
    ).toEqual({
      apiUrl: "http://x",
      accounts: { default: { apiKey: "k1", workspaceId: "ws" } },
    });
  });

  test("never overwrites an account already named `default`", () => {
    const out = migrate({
      apiKey: "old",
      accounts: { default: { apiKey: "new" } },
    });
    expect(out.accounts).toEqual({ default: { apiKey: "new" } });
    expect(out).not.toHaveProperty("apiKey");
  });

  test("a file without the legacy key is left as is", () => {
    const file = { accounts: { a: { apiKey: "k" } }, activeAccount: "a" };
    expect(migrate(file)).toEqual(file);
  });
});

describe("resolveAccounts", () => {
  const file = {
    apiUrl: "http://global",
    accounts: {
      "a@x.com": { apiKey: "ka" },
      "b@x.com": { apiKey: "kb", apiUrl: "http://b", workspaceId: "wb" },
    },
  };

  test("nothing pinned: every stored account, in order", () => {
    expect(resolveAccounts(file, {})).toEqual([
      { name: "a@x.com", apiUrl: "http://global", apiKey: "ka" },
      {
        name: "b@x.com",
        apiUrl: "http://b",
        apiKey: "kb",
        workspaceId: "wb",
      },
    ]);
  });

  test("a pinned account narrows to it, and --account beats the pin", () => {
    const pinned = { ...file, activeAccount: "b@x.com" };
    expect(resolveAccounts(pinned, {}).map((a) => a.name)).toEqual(["b@x.com"]);
    expect(resolveAccounts(pinned, {}, "a@x.com").map((a) => a.name)).toEqual([
      "a@x.com",
    ]);
  });

  test("an unknown name fails, naming what is stored", () => {
    expect(() => resolveAccounts(file, {}, "nope")).toThrow(
      /nope.*a@x\.com, b@x\.com/,
    );
  });

  test("FT_API_KEY is one anonymous account: no fan-out over stored logins", () => {
    const out = resolveAccounts(file, {
      FT_API_KEY: "ft_live_ci",
      FT_WORKSPACE_ID: "w1",
    });
    expect(out).toEqual([
      {
        name: "FT_API_KEY",
        apiUrl: "http://global",
        apiKey: "ft_live_ci",
        workspaceId: "w1",
      },
    ]);
  });

  test("a legacy file resolves through the migration", () => {
    expect(
      resolveAccounts(migrate({ apiKey: "k" }), {}).map((a) => a.name),
    ).toEqual(["default"]);
  });
});
