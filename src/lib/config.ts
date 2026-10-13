import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** One stored login. Several can live side by side (`ft login --account`). */
export interface Account {
  apiKey: string;
  /** Only when it differs from the global `apiUrl` (`ft login --url`). */
  apiUrl?: string;
  /** Pinned workspace of this account (`ft workspace use`). */
  workspaceId?: string;
}

/** What ~/.freeticket/config.json holds. */
export interface ConfigFile {
  apiUrl?: string;
  accounts?: Record<string, Account>;
  /** Pinned account (`ft account use`). Absent = every stored account. */
  activeAccount?: string;
  /** Superadmin (/api/admin): better-auth session token of a SUPER_ADMIN. */
  adminSession?: string;
  /** Legacy single-account layout, read as the account `default`. */
  apiKey?: string;
  /** Legacy single-account layout, read as the account `default`. */
  workspaceId?: string;
}

export interface FtConfig {
  apiUrl: string;
  /** The credential when exactly one account is in effect (env or stored). */
  apiKey?: string;
  workspaceId?: string;
  /** Superadmin (/api/admin): better-auth session token of a SUPER_ADMIN. */
  adminSession?: string;
}

/** An account ready to talk to the API: name, URL and credential resolved. */
export interface ResolvedAccount {
  name: string;
  apiUrl: string;
  apiKey: string;
  workspaceId?: string;
}

const CONFIG_DIR = join(homedir(), ".freeticket");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const DEFAULT_API_URL = "https://admin.appfreeticket.com";
/** Name given to a pre-multi-account login, and the fallback login name. */
export const LEGACY_ACCOUNT = "default";
/** Name shown for the anonymous FT_API_KEY account. */
export const ENV_ACCOUNT = "FT_API_KEY";

function readFile(): ConfigFile {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return migrate(JSON.parse(readFileSync(CONFIG_PATH, "utf8")));
  } catch {
    return {};
  }
}

/**
 * Moves the legacy top-level `apiKey`/`workspaceId` into `accounts.default`.
 * Reads go through it too, so an old file works before anything is saved; the
 * next save writes the new layout.
 */
export function migrate(file: ConfigFile): ConfigFile {
  const { apiKey, workspaceId, ...rest } = file;
  if (!apiKey) return rest;
  const accounts = { ...rest.accounts };
  accounts[LEGACY_ACCOUNT] ??= { apiKey, workspaceId };
  return { ...rest, accounts };
}

/**
 * The accounts a command may use, in stored order.
 *
 * `FT_API_KEY` wins over everything and is a single anonymous account (CI):
 * a pipeline must never fan out across whatever logins sit on the machine.
 * Otherwise `--account` narrows to one, then the pinned account, then all of
 * them. `FT_API_URL` and `FT_WORKSPACE_ID` override every account they apply to.
 */
export function resolveAccounts(
  file: ConfigFile,
  env: NodeJS.ProcessEnv,
  accountFlag?: string,
): ResolvedAccount[] {
  const apiUrl = (a?: Account) =>
    env.FT_API_URL ?? a?.apiUrl ?? file.apiUrl ?? DEFAULT_API_URL;
  if (env.FT_API_KEY) {
    return [
      {
        name: ENV_ACCOUNT,
        apiUrl: apiUrl(),
        apiKey: env.FT_API_KEY,
        workspaceId: env.FT_WORKSPACE_ID,
      },
    ];
  }
  const accounts = file.accounts ?? {};
  const resolve = ([name, a]: [string, Account]): ResolvedAccount => ({
    name,
    apiUrl: apiUrl(a),
    apiKey: a.apiKey,
    workspaceId: env.FT_WORKSPACE_ID ?? a.workspaceId,
  });
  const pick = accountFlag ?? file.activeAccount;
  if (pick !== undefined) {
    const picked = accounts[pick];
    if (!picked) {
      const names = Object.keys(accounts).join(", ");
      throw new Error(
        `No account named "${pick}". Stored: ${names || "(none)"}`,
      );
    }
    return [resolve([pick, picked])];
  }
  return Object.entries(accounts).map(resolve);
}

/** `resolveAccounts` against the real file and environment. */
export function effectiveAccounts(accountFlag?: string): ResolvedAccount[] {
  return resolveAccounts(readFile(), process.env, accountFlag);
}

/** Raw stored state (migrated), for the commands that manage accounts. */
export function readConfig(): ConfigFile {
  return readFile();
}

/**
 * Resolved config for the current process.
 * Precedence: env vars > ~/.freeticket/config.json > default.
 * `apiKey`/`workspaceId` are only set when a single account is in effect.
 */
export function loadConfig(): FtConfig {
  const file = readFile();
  let accounts: ResolvedAccount[] = [];
  try {
    accounts = resolveAccounts(file, process.env);
  } catch {
    // A pin to an account that no longer exists: nothing is "in effect".
  }
  const only = accounts.length === 1 ? accounts[0] : undefined;
  return {
    apiUrl:
      process.env.FT_API_URL ?? only?.apiUrl ?? file.apiUrl ?? DEFAULT_API_URL,
    apiKey: only?.apiKey,
    workspaceId: process.env.FT_WORKSPACE_ID ?? only?.workspaceId,
    adminSession: process.env.FT_ADMIN_SESSION ?? file.adminSession,
  };
}

/** Persists changes to ~/.freeticket/config.json (merged with existing values). */
export function saveConfig(patch: Partial<ConfigFile>): void {
  const next = { ...readFile(), ...patch };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  // 0600: the file stores credentials (device-flow session or CI API key).
  // `mode` on writeFileSync only applies when the file is CREATED - it is the
  // mode passed to open(2) with O_CREAT. An existing file keeps whatever mode
  // it already had (a restored backup, a different umask, a CLI version that
  // did not set it), so the credentials could stay world-readable forever with
  // no warning. chmod every write to make the promise in this comment true.
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(CONFIG_PATH, 0o600);
}

/**
 * Adds, replaces (`account` given) or removes (`undefined`) one stored account
 * without touching the others. Removing the pinned account unpins it.
 */
export function saveAccount(name: string, account: Account | undefined): void {
  const file = readFile();
  const accounts = { ...file.accounts };
  if (account) accounts[name] = account;
  else delete accounts[name];
  saveConfig({
    accounts,
    activeAccount:
      !account && file.activeAccount === name ? undefined : file.activeAccount,
  });
}

export { CONFIG_PATH };
