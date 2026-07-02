import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface FtConfig {
  apiUrl: string;
  apiKey?: string;
  workspaceId?: string;
  /** Superadmin (/api/admin): better-auth session token of a SUPER_ADMIN. */
  adminSession?: string;
}

const CONFIG_DIR = join(homedir(), ".freeticket");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
const DEFAULT_API_URL = "https://admin.appfreeticket.com";

function readFile(): Partial<FtConfig> {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Resolved config for the current process.
 * Precedence: env vars > ~/.freeticket/config.json > default.
 */
export function loadConfig(): FtConfig {
  const file = readFile();
  return {
    apiUrl: process.env.FT_API_URL ?? file.apiUrl ?? DEFAULT_API_URL,
    apiKey: process.env.FT_API_KEY ?? file.apiKey,
    workspaceId: process.env.FT_WORKSPACE_ID ?? file.workspaceId,
    adminSession: process.env.FT_ADMIN_SESSION ?? file.adminSession,
  };
}

/** Persists changes to ~/.freeticket/config.json (merged with existing values). */
export function saveConfig(patch: Partial<FtConfig>): void {
  const next = { ...readFile(), ...patch };
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  // 0600: the file stores credentials (device-flow session or CI API key).
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
}

export { CONFIG_PATH };
