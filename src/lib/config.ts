import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
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
  /** Email `/me` reported at login: a later login of the same user replaces it. */
  email?: string;
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
  /**
   * Workspace pinned for the `FT_API_KEY` account (`ft workspace use` with the
   * env key). In a legacy file it is also the `default` account's pin.
   */
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

/**
 * A config file that exists but cannot be parsed. Thrown, never swallowed: an
 * unreadable file read as `{}` is wiped by the next save, every login with it.
 */
export class ConfigError extends Error {}

function readFile(): ConfigFile {
  if (!existsSync(CONFIG_PATH)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (err) {
    throw new ConfigError(
      `${CONFIG_PATH} is not valid JSON (${(err as Error).message}). Fix it, or move it away and run \`ft login\` again.`,
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new ConfigError(`${CONFIG_PATH} does not hold a JSON object.`);
  return migrate(parsed as ConfigFile);
}

/**
 * Moves the legacy top-level `apiKey` into `accounts.default` (with the pinned
 * workspace). Reads go through it too, so an old file works before anything is
 * saved; the next save writes the new layout. The top-level `workspaceId`
 * stays: it is still what `FT_API_KEY` reads.
 */
export function migrate(file: ConfigFile): ConfigFile {
  const { apiKey, ...rest } = file;
  if (!apiKey) return rest;
  const accounts = { ...rest.accounts };
  accounts[LEGACY_ACCOUNT] ??= {
    apiKey,
    ...(rest.workspaceId ? { workspaceId: rest.workspaceId } : {}),
  };
  return { ...rest, accounts };
}

/**
 * Where `ft login` stores the credential for the user `/me` says it is.
 * `--account` is taken literally. Otherwise a stored account with the same
 * email is replaced in place (a re-login after a 401 must not leave two
 * accounts behind, which would make every mutation ambiguous), and so is a
 * lone legacy `default`, which predates storing the email. Else it is added
 * under the email.
 */
export function loginTarget(
  file: ConfigFile,
  email: string | undefined,
  accountFlag?: string,
): { name: string; replaces?: string } {
  if (accountFlag) return { name: accountFlag };
  const accounts = file.accounts ?? {};
  const same = Object.entries(accounts).find(
    ([, a]) => email !== undefined && a.email === email,
  );
  if (same) return { name: same[0] };
  const name = email ?? LEGACY_ACCOUNT;
  const names = Object.keys(accounts);
  if (
    names.length === 1 &&
    names[0] === LEGACY_ACCOUNT &&
    !accounts[LEGACY_ACCOUNT]?.email
  )
    return { name, replaces: LEGACY_ACCOUNT };
  return { name };
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
    // Picking a stored account while the env key overrides them all would
    // silently act as somebody else.
    if (accountFlag)
      throw new Error(
        "FT_API_KEY overrides --account; unset it to use stored accounts.",
      );
    return [
      {
        name: ENV_ACCOUNT,
        apiUrl: apiUrl(),
        apiKey: env.FT_API_KEY,
        // Same as before accounts existed: a workspace pinned in the file
        // still applies to the env key.
        workspaceId: env.FT_WORKSPACE_ID ?? file.workspaceId,
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
  //
  // Written to a temp file in the same directory and renamed over the real one:
  // a crash or a full disk mid-write leaves the old file intact instead of a
  // truncated one that would cost every stored login.
  const tmp = `${CONFIG_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, CONFIG_PATH);
}

/**
 * Adds, replaces (`account` given) or removes (`undefined`) one stored account
 * without touching the others. Removing the pinned account unpins it.
 */
export function saveAccount(
  name: string,
  account: Account | undefined,
  replaces?: string,
): void {
  const file = readFile();
  const accounts = { ...file.accounts };
  // `replaces`: the login took over another stored account (see loginTarget);
  // a pin on it follows to the new name.
  if (replaces && replaces !== name) delete accounts[replaces];
  if (account) accounts[name] = account;
  else delete accounts[name];
  let activeAccount = file.activeAccount;
  if (replaces && activeAccount === replaces) activeAccount = name;
  if (!account && activeAccount === name) activeAccount = undefined;
  saveConfig({ accounts, activeAccount });
}

export { CONFIG_PATH };
