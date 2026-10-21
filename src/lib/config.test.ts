import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadConfig, loginTarget, migrate, resolveAccounts } from "./config";

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

test("apiUrl falls back to the default with no env and no file", () => {
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
      // Kept at the top level too: it is what FT_API_KEY reads.
      workspaceId: "ws",
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

describe("FT_API_KEY", () => {
  test("keeps the workspace pinned in the file, as before accounts existed", () => {
    const file = migrate({ apiKey: "stored", workspaceId: "ws_file" });
    const [only] = resolveAccounts(file, { FT_API_KEY: "ft_live_ci" });
    expect(only?.apiKey).toBe("ft_live_ci");
    expect(only?.workspaceId).toBe("ws_file");
    // FT_WORKSPACE_ID still beats the file.
    expect(
      resolveAccounts(file, { FT_API_KEY: "k", FT_WORKSPACE_ID: "ws_env" })[0]
        ?.workspaceId,
    ).toBe("ws_env");
  });

  test("rejects --account instead of silently ignoring it", () => {
    expect(() =>
      resolveAccounts(
        { accounts: { a: { apiKey: "k" } } },
        { FT_API_KEY: "x" },
        "a",
      ),
    ).toThrow(
      "FT_API_KEY overrides --account; unset it to use stored accounts",
    );
  });
});

describe("loginTarget", () => {
  test("--account is taken literally", () => {
    expect(loginTarget({}, "a@x.com", "work")).toEqual({ name: "work" });
  });

  test("a re-login of the same user replaces that account, whatever its name", () => {
    const file = {
      accounts: {
        work: { apiKey: "old", email: "a@x.com" },
        "b@x.com": { apiKey: "kb", email: "b@x.com" },
      },
    };
    expect(loginTarget(file, "a@x.com")).toEqual({ name: "work" });
  });

  test("a lone legacy `default` (no stored email) is taken over", () => {
    const file = migrate({ apiKey: "legacy" });
    expect(loginTarget(file, "a@x.com")).toEqual({
      name: "a@x.com",
      replaces: "default",
    });
  });

  test("a different user is added next to the others", () => {
    const file = {
      accounts: { "a@x.com": { apiKey: "ka", email: "a@x.com" } },
    };
    expect(loginTarget(file, "b@x.com")).toEqual({ name: "b@x.com" });
  });
});

describe("config file on disk", () => {
  // CONFIG_PATH is fixed when the module loads, so each test mocks homedir()
  // to a fresh directory and imports a fresh copy. Setting HOME is not enough:
  // vitest workers keep their own env copy and os.homedir() reads the real
  // one, so the tests would write to the developer's actual config.
  let home: string;
  let path: string;
  const load = async () => {
    vi.resetModules();
    vi.doMock("node:os", async (orig) => ({
      ...(await orig<typeof import("node:os")>()),
      homedir: () => home,
    }));
    const cfg = await import("./config");
    // Refuse to go on against anything but the sandbox.
    if (!cfg.CONFIG_PATH.startsWith(home))
      throw new Error(`config test escaped its sandbox: ${cfg.CONFIG_PATH}`);
    return cfg;
  };
  afterEach(() => {
    vi.doUnmock("node:os");
  });
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ft-cfg-"));
    mkdirSync(join(home, ".freeticket"));
    path = join(home, ".freeticket", "config.json");
  });

  test("an unparsable file fails loudly and the next save does not wipe it", async () => {
    writeFileSync(path, '{"accounts": {"a": {"apiKey": "k"}');
    const cfg = await load();
    expect(() => cfg.readConfig()).toThrow(/not valid JSON/);
    expect(() => cfg.saveAccount("b", { apiKey: "kb" })).toThrow(
      /not valid JSON/,
    );
    expect(readFileSync(path, "utf8")).toBe(
      '{"accounts": {"a": {"apiKey": "k"}',
    );
  });

  test("saves atomically, 0600, without leaving the temp file behind", async () => {
    const cfg = await load();
    cfg.saveAccount("a", { apiKey: "ka" });
    cfg.saveAccount("b", { apiKey: "kb" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(home, ".freeticket"))).toEqual(["config.json"]);
    expect(Object.keys(cfg.readConfig().accounts ?? {})).toEqual(["a", "b"]);
  });

  test("a login replacing `default` carries its pin over", async () => {
    writeFileSync(
      path,
      JSON.stringify({ apiKey: "legacy", activeAccount: "default" }),
    );
    const cfg = await load();
    cfg.saveAccount("a@x.com", { apiKey: "new", email: "a@x.com" }, "default");
    const file = cfg.readConfig();
    expect(Object.keys(file.accounts ?? {})).toEqual(["a@x.com"]);
    expect(file.activeAccount).toBe("a@x.com");
    expect(existsSync(path)).toBe(true);
  });
});
