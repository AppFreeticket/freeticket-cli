import { client as adminClient } from "../admin-client/client.gen";
import { client } from "../client/client.gen";
import { loadConfig } from "./config";

/**
 * Configures the generated client with the base URL + auth headers.
 * Call once at the start of each command, with an optional workspace override.
 */
export function configureClient(workspaceOverride?: string): void {
  const cfg = loadConfig();
  if (!cfg.apiKey) {
    fail("No API key configured. Run `ft login` or export FT_API_KEY.");
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

function hintFor(status?: number): string | undefined {
  switch (status) {
    case 401:
      return "Invalid, revoked, or expired API key. Run `ft login`.";
    case 403:
      return "Your role or workspace does not allow this action.";
    case 404:
      return "The resource does not exist or belongs to another workspace.";
    case 501:
      return "The backend has not implemented this operation yet.";
  }
}

/** Prints the error (+ optional hint) and exits with code 1. */
export function fail(message: string, hint?: string): never {
  console.error(message);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}
