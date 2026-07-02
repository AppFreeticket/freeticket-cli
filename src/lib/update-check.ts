import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import chalk from "chalk";

const CACHE_PATH = join(homedir(), ".freeticket", "update-check.json");
const REGISTRY = "https://registry.npmjs.org/@freeticket/cli/latest";
const ONE_DAY = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 1500;

/**
 * Soft update notice. Prints to *stderr* when a newer @freeticket/cli is on npm,
 * so `--json` on stdout stays clean and pipelines are never touched. The npm
 * registry is hit at most once a day (cached in ~/.freeticket); every other run
 * reads the cache and is instant. Best-effort: any failure is swallowed.
 *
 * Opt out with FT_NO_UPDATE_CHECK=1. Skipped in non-interactive/CI contexts so
 * automation never sees it.
 *
 * ponytail: soft notify only. If the backend ever needs to *force* an upgrade
 * (breaking contract), add a min-version gate here that reads a required version
 * and calls fail() instead of just warning.
 */
export async function notifyUpdate(current: string): Promise<void> {
  if (
    !process.stderr.isTTY ||
    process.env.FT_NO_UPDATE_CHECK ||
    process.env.CI
  ) {
    return;
  }
  try {
    const latest = await getLatest();
    if (latest && isNewer(latest, current)) {
      process.stderr.write(
        `\n${chalk.yellow(`⚠ Update available: @freeticket/cli ${current} → ${latest}`)}\n` +
          `${chalk.dim("  npm i -g @freeticket/cli@latest  ·  or use  npx @freeticket/cli@latest")}\n\n`,
      );
    }
  } catch {
    // ponytail: the update check must never break a command. Ignore everything.
  }
}

/** Latest version from cache (fresh ≤ 1 day) or the npm registry. */
async function getLatest(): Promise<string | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.at < ONE_DAY) return cached.latest;

  const res = await fetch(REGISTRY, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    headers: { Accept: "application/vnd.npm.install-v1+json" },
  });
  if (!res.ok) throw new Error(`registry ${res.status}`);
  const latest = ((await res.json()) as { version?: string }).version ?? null;
  if (latest) writeCache({ at: Date.now(), latest });
  return latest;
}

function readCache(): { at: number; latest: string } | null {
  if (!existsSync(CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(v: { at: number; latest: string }): void {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(v));
  } catch {
    // ponytail: caching is an optimization; a failed write just means we re-check.
  }
}

/** True when semver `a` is strictly greater than `b` (major.minor.patch; prerelease ignored). */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const [maj, min, pat] = (v.replace(/^v/, "").split("-")[0] ?? "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
    return [maj ?? 0, min ?? 0, pat ?? 0];
  };
  const [aM, aN, aP] = parse(a);
  const [bM, bN, bP] = parse(b);
  return aM > bM || (aM === bM && (aN > bN || (aN === bN && aP > bP)));
}
