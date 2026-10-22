import { client as adminClient } from "../admin-client/client.gen";
import { client } from "../client/client.gen";
import { getMe } from "../client/sdk.gen";
import { effectiveAccounts, loadConfig, type ResolvedAccount } from "./config";

/**
 * `--account <name>` of the command being run. Set once by a preAction hook in
 * index.ts, so every command that takes `--workspace` honors it without each
 * one threading it through.
 */
let accountFlag: string | undefined;
export function setAccountFlag(name: string | undefined): void {
  accountFlag = name;
}

/** Every account the current command may use (see `resolveAccounts`). */
export function accountsInScope(): ResolvedAccount[] {
  try {
    return effectiveAccounts(accountFlag);
  } catch (err) {
    const message = (err as Error).message;
    fail(
      message,
      message.startsWith("No account named")
        ? "See them with `ft account list`; `ft account clear` unpins."
        : undefined,
    );
  }
}

/**
 * The one account a non-list command acts on. Several stored and none chosen
 * is a hard stop, never a guess: a `create` or a `refund` landing on the wrong
 * account is not something to find out afterwards.
 */
export function resolveAccount(): ResolvedAccount {
  const accounts = accountsInScope();
  if (accounts.length === 0) {
    fail(
      "Not logged in. Run `ft login` to sign in through your browser.",
      "CI / headless only: set FT_API_KEY (or `ft login --key`) with a backend-issued token.",
    );
  }
  if (accounts.length > 1) {
    fail(
      `Several accounts are stored (${accounts.map((a) => a.name).join(", ")}) and this command needs exactly one.`,
      "Pick one with --account <name>, or pin it with `ft account use <name>`.",
    );
  }
  return accounts[0] as ResolvedAccount;
}

/**
 * Configures the generated client with the base URL + auth headers.
 * Call once at the start of each command, with an optional workspace override.
 * The client is a singleton, so a fan-out calls this again before each target
 * and runs the targets one after another.
 */
export function configureClient(
  workspaceOverride?: string,
  account: ResolvedAccount = resolveAccount(),
): void {
  const workspaceId = workspaceOverride ?? account.workspaceId;
  client.setConfig({
    baseUrl: `${account.apiUrl.replace(/\/$/, "")}/api/v1`,
    headers: {
      Authorization: `Bearer ${account.apiKey}`,
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    },
  });
}

/**
 * Configures the superadmin client (/api/admin). Two credentials, in order:
 *
 * 1. `FT_ADMIN_TOKEN` — a platform service token (PAT, minted with
 *    `ft admin tokens create`), sent as `Authorization: Bearer`. The headless
 *    path for CI and scripts. With a Bearer present the backend never falls
 *    back to the cookie, so a bad token is a 401, not a silent session.
 * 2. The SUPER_ADMIN better-auth session cookie (`FT_ADMIN_SESSION` or
 *    `ft admin login`).
 */
export function configureAdminClient(): void {
  const cfg = loadConfig();
  const baseUrl = `${cfg.apiUrl.replace(/\/$/, "")}/api/admin`;
  const token = process.env.FT_ADMIN_TOKEN?.trim();
  if (token) {
    adminClient.setConfig({
      baseUrl,
      // setConfig merges headers: null drops a credential left by an earlier call.
      headers: { Authorization: `Bearer ${token}`, Cookie: null },
    });
    return;
  }
  if (!cfg.adminSession) {
    fail(
      "No superadmin credential. Export FT_ADMIN_TOKEN with a service token, or FT_ADMIN_SESSION with a SUPER_ADMIN better-auth session token.",
      "Mint a token with `ft admin tokens create`, or log in to the admin panel and copy the `better-auth.session_token` cookie (`ft admin login --session <token>`).",
    );
  }
  adminClient.setConfig({
    baseUrl,
    headers: {
      Authorization: null,
      Cookie: `better-auth.session_token=${cfg.adminSession}`,
    },
  });
}

/**
 * Signed downloads (settlement PDF / payment proofs): the API answers **302**
 * to a 5-minute URL on private storage. `fetch` would follow the redirect and
 * pull the whole file into memory, so we stop at the 302 and hand over the
 * link. Uses the same config the generated client already holds.
 */
export async function signedDownload(
  path: string,
): Promise<{ url: string; expiresInMinutes: number }> {
  const cfg = client.getConfig();
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    redirect: "manual",
    headers: cfg.headers as Record<string, string>,
  });
  const url = res.headers.get("location");
  if (!url)
    fail(
      `The API did not return a signed URL (HTTP ${res.status}).`,
      res.status === 404
        ? "The settlement has no document yet, or it belongs to another workspace."
        : undefined,
    );
  return { url, expiresInMinutes: 5 };
}

type ApiError = {
  code?: string;
  message?: string;
  details?: { path?: string; message?: string }[];
};

/**
 * Unwraps the generated client response: returns `data` or aborts with a
 * readable message from the `{ error: { code, message } }` envelope.
 */
export function unwrap<T>(res: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (res.data !== undefined) return res.data;
  const status = res.response?.status;
  const err = (res.error as { error?: ApiError })?.error;
  if (err) {
    const lines = [
      `Error ${status ?? ""} [${err.code ?? "?"}]: ${err.message ?? "unknown failure"}`.trim(),
    ];
    for (const d of err.details ?? [])
      lines.push(`  · ${d.path ?? ""}: ${d.message ?? ""}`.trimEnd());
    fail(lines.join("\n"), hintFor(status));
  }
  fail(
    `The API responded with ${status ?? "an error"} without a readable body.`,
  );
}

/**
 * The same message `unwrap` would abort with, as a string. A fan-out across
 * workspaces needs to name what went wrong in one of them without killing the
 * command: the other workspaces still have rows to show.
 */
export function describeError(res: {
  error?: unknown;
  response?: Response;
}): string {
  const status = res.response?.status;
  const err = (res.error as { error?: ApiError })?.error;
  if (!err) return `HTTP ${status ?? "error"}`;
  return `${status ?? ""} ${err.code ?? "?"}: ${err.message ?? "unknown failure"}`.trim();
}

/**
 * One line telling the caller what to do next. The split that matters is
 * retryable vs not: an agent burning a tool budget needs to tell "wait and try
 * again" apart from "this will never work", and today it can only infer that
 * from the status. A `retryable` flag in the error envelope would be better
 * (AppFreeticket/free-admin#677); until then this is the honest approximation.
 */
function hintFor(status?: number): string | undefined {
  switch (status) {
    case 401:
      return "Your session is invalid, revoked, or expired. Run `ft login`.";
    case 403:
      return "Your role or workspace does not allow this action.";
    case 404:
      return "The resource does not exist or belongs to another workspace.";
    case 422:
      return "Validation failed. Fix the fields listed above and retry.";
    case 429:
      return "Rate limit reached. Wait and retry with backoff - this one is worth retrying.";
    case 500:
      return "Server error. Retry once; if it persists, report it.";
    case 501:
      return "The backend has not implemented this operation yet.";
    case 503:
      return "The service is temporarily unavailable. Retry with backoff.";
  }
}

/** Prints the error (+ optional hint) and exits with code 1. */
export function fail(message: string, hint?: string): never {
  console.error(message);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

/** One workspace of a fan-out, as `GET /me` describes it. */
export interface WorkspaceTarget {
  id: string;
  name: string;
  /** The account it is read through. */
  account: ResolvedAccount;
}

type MeWorkspace = {
  id: string;
  name: string;
  sections: string[] | null;
};

/**
 * The fan-out set from what each account's /me returned: every reachable
 * workspace of every account, in account order. A workspace two accounts both
 * reach is read once, through the first of them. An account pinned to a
 * workspace contributes only that one; `--workspace` keeps only that one.
 */
export function expandTargets(
  perAccount: { account: ResolvedAccount; workspaces: MeWorkspace[] }[],
  workspaceFlag?: string,
): WorkspaceTarget[] {
  const seen = new Set<string>();
  const out: WorkspaceTarget[] = [];
  for (const { account, workspaces } of perAccount) {
    const only = workspaceFlag ?? account.workspaceId;
    for (const w of workspaces) {
      // `sections: []` = access revoked or expired in that workspace; `null` =
      // unrestricted. Querying a revoked one only buys a 403.
      if (w.sections !== null && w.sections.length === 0) continue;
      if (only && w.id !== only) continue;
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      out.push({ id: w.id, name: w.name, account });
    }
  }
  return out;
}

/**
 * The workspaces a list command should read.
 *
 * `null` means "just call the API once": the client is left configured for
 * that call. That is a single account narrowed to one workspace (`--workspace`,
 * `ft workspace use`, `FT_WORKSPACE_ID`) or reaching only one anyway, or
 * several accounts of which exactly one reaches the workspace asked for.
 * Anything else is the set to fan out across, every account × every workspace
 * it reaches: belonging to five workspaces and being shown one of them,
 * silently, is how people never learn the other four exist.
 *
 * With one account, a /me that cannot be read returns `null` too: falling back
 * to the single call is honest, printing an empty list because discovery
 * failed is not. With several, the account whose /me fails is named on stderr
 * and the others still answer.
 */
export async function listTargets(
  override?: string,
): Promise<WorkspaceTarget[] | null> {
  const accounts = accountsInScope();
  if (accounts.length <= 1) {
    const account = resolveAccount();
    if (!override && !account.workspaceId) {
      configureClient(undefined, account);
      const res = await getMe({});
      const targets = expandTargets([
        { account, workspaces: res.data?.data.workspaces ?? [] },
      ]);
      if (targets.length > 1) return targets;
    }
    configureClient(override, account);
    return null;
  }
  const perAccount = [];
  const errors: string[] = [];
  for (const account of accounts) {
    configureClient(undefined, account);
    const res = await getMe({});
    if (!res.data) {
      errors.push(`account ${account.name}: ${describeError(res)}`);
      continue;
    }
    perAccount.push({ account, workspaces: res.data.data.workspaces });
  }
  failIfNoneAnswered(perAccount.length, errors);
  const targets = expandTargets(perAccount, override);
  if (override && targets.length === 0) {
    fail(
      `No stored account reaches workspace ${override}.`,
      "See what each one reaches with `ft workspace list`.",
    );
  }
  const [only] = targets;
  if (only && targets.length === 1) {
    configureClient(only.id, only.account);
    return null;
  }
  return targets;
}

/**
 * Fan-out bookkeeping across accounts: the ones that failed are named on
 * stderr, and if none answered the command fails. An empty table with exit 0
 * would read as "you have nothing", when every login is in fact expired.
 */
export function failIfNoneAnswered(answered: number, errors: string[]): void {
  if (answered === 0 && errors.length > 0)
    fail(
      `No account could be read:\n${errors.map((e) => `  · ${e}`).join("\n")}`,
      "Run `ft login` again for the expired ones, or remove them with `ft account remove <name>`.",
    );
  for (const e of errors) console.error(`(${e})`);
}

/** True when the targets span more than one account (show an `account` column). */
export function spansAccounts(targets: WorkspaceTarget[]): boolean {
  return new Set(targets.map((t) => t.account.name)).size > 1;
}

/** Tags a fan-out row with where it came from. */
export function tagRow(
  ws: WorkspaceTarget,
  row: object,
  withAccount: boolean,
): Record<string, unknown> {
  return {
    ...(withAccount ? { account: ws.account.name } : {}),
    workspaceId: ws.id,
    workspaceName: ws.name,
    ...row,
  };
}

/**
 * Spreads `limit` across the workspaces about to be queried, so `--limit 20`
 * over five workspaces is 20 rows and not 100. Rounds up, and the surplus is
 * trimmed off the aggregate by the caller.
 */
export function splitLimit(limit: number, targets: number): number {
  if (!Number.isFinite(limit) || limit <= 0 || targets <= 1) return limit;
  return Math.max(1, Math.ceil(limit / targets));
}
