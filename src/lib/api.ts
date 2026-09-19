import { client as adminClient } from "../admin-client/client.gen";
import { client } from "../client/client.gen";
import { getMe } from "../client/sdk.gen";
import { loadConfig } from "./config";

/**
 * Configures the generated client with the base URL + auth headers.
 * Call once at the start of each command, with an optional workspace override.
 */
export function configureClient(workspaceOverride?: string): void {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    fail(
      "Not logged in. Run `ft login` to sign in through your browser.",
      "CI / headless only: set FT_API_KEY (or `ft login --key`) with a backend-issued token.",
    );
  }
  const workspaceId = workspaceOverride ?? cfg.workspaceId;
  client.setConfig({
    baseUrl: `${cfg.apiUrl.replace(/\/$/, "")}/api/v1`,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
    },
  });
}

/**
 * Configures the superadmin client (/api/admin). Auth is a better-auth session
 * cookie of a SUPER_ADMIN — NOT an API key (the admin contract issues no keys).
 * MVP: paste the session token via FT_ADMIN_SESSION; converges to a service
 * token once the backend ships it (see free-admin#157).
 * ponytail: cookie header until the Bearer service-token lands.
 */
export function configureAdminClient(): void {
  const cfg = loadConfig();
  if (!cfg.adminSession) {
    fail(
      "No superadmin session. Export FT_ADMIN_SESSION with a SUPER_ADMIN better-auth session token.",
      "Log in to the admin panel in your browser and copy the `better-auth.session_token` cookie.",
    );
  }
  adminClient.setConfig({
    baseUrl: `${cfg.apiUrl.replace(/\/$/, "")}/api/admin`,
    headers: {
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
}

/**
 * The workspaces a list command should read.
 *
 * `null` means "just call the API once as configured" — the caller pinned one
 * with `--workspace`, or the session is pinned (`ft workspace use`,
 * `FT_WORKSPACE_ID`), or the account only reaches one anyway. Anything else is
 * the set to fan out across: belonging to five workspaces and being shown one
 * of them, silently, is how people never learn the other four exist.
 *
 * A /me that cannot be read returns `null` too: falling back to the single
 * call is honest, printing an empty list because discovery failed is not.
 */
export async function listTargets(
  override?: string,
): Promise<WorkspaceTarget[] | null> {
  if (override || loadConfig().workspaceId) return null;
  const res = await getMe({});
  const workspaces = res.data?.data.workspaces ?? [];
  // `sections: []` = access revoked or expired in that workspace; `null` =
  // unrestricted. Querying a revoked one only buys a 403.
  const reachable = workspaces.filter(
    (w) => w.sections === null || w.sections.length > 0,
  );
  return reachable.length > 1 ? reachable : null;
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
