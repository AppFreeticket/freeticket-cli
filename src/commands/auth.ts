import { spawn } from "node:child_process";
import chalk from "chalk";
import type { Command } from "commander";
import { client } from "../client/client.gen";
import {
  getMe,
  postAuthDeviceCode,
  postAuthDeviceToken,
} from "../client/sdk.gen";
import { configureClient, fail, unwrap } from "../lib/api";
import { CONFIG_PATH, loadConfig, saveConfig } from "../lib/config";
import { print } from "../lib/output";

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description(
      "Log in via the browser (device flow) and store the session in ~/.freeticket/config.json",
    )
    .option(
      "--key <ft_live_…>",
      "Skip the browser and use an API key issued in the backend (CI / automation)",
    )
    .option(
      "--url <url>",
      "API base URL (default: https://admin.appfreeticket.com)",
    )
    .option(
      "--workspace <id>",
      "pin this login to one workspace (default: every workspace the account reaches)",
    )
    .option("--json", "raw JSON output (confirmation goes to stderr)")
    .action(async (opts) => {
      if (opts.url) saveConfig({ apiUrl: opts.url });

      // Browser device flow is the default; --key stays for headless/CI.
      const cred = opts.key
        ? { apiKey: opts.key as string, workspaceId: undefined }
        : await deviceLogin();
      const workspaceId = opts.workspace ?? cred.workspaceId;

      // Passing `undefined` is the point: a fresh login must drop the
      // workspace a previous one pinned, and an undefined value disappears in
      // JSON.stringify, so the key leaves the file instead of being merged
      // back in from what was already there.
      saveConfig({ apiKey: cred.apiKey, workspaceId });
      // Verify the credential against /me before reporting success.
      configureClient(workspaceId);
      const me = unwrap(await getMe({})).data;
      // stderr so `ft login --json | jq` stays parseable.
      console.error(
        `${chalk.green("✓")} Session saved in ${chalk.dim(CONFIG_PATH)}`,
      );
      print(me, { json: opts.json });
    });

  program
    .command("whoami")
    .description("Show the authenticated user and workspaces (GET /me)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      configureClient();
      const me = unwrap(await getMe({})).data;
      print(me, { json: opts.json });
    });

  program
    .command("logout")
    .description("Log out and remove the stored session")
    .action(() => {
      saveConfig({ apiKey: undefined });
      console.log(
        `${chalk.green("✓")} Logged out — session removed from ${chalk.dim(CONFIG_PATH)}`,
      );
    });

  program
    .command("config")
    .description("Show active configuration (the credential is masked)")
    .option("--json", "raw JSON output")
    .action((opts) => {
      const cfg = loadConfig();
      print(
        {
          apiUrl: cfg.apiUrl,
          // Same field whether it's a device-flow session or a CI API key.
          session: cfg.apiKey ? `${cfg.apiKey.slice(0, 12)}…` : null,
          workspaceId: cfg.workspaceId ?? null,
        },
        { json: opts.json },
      );
    });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Best-effort: open the URL in the default browser; never throws. */
function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  } catch {
    // ponytail: printing the URL is the fallback; ignore launch failures.
  }
}

/**
 * OAuth 2.0 Device Authorization Grant (RFC 8628): self-service browser login.
 * Mints an access token bound to the user's role, so anyone can authenticate
 * without a backend-issued API key. Returns the credential to persist. The
 * endpoints are public (no auth) — the token IS the bootstrap.
 *
 * It pins **no workspace**. Logging in used to silently make `workspaces[0]`
 * the active one, so a user who belonged to five tenants saw one and never
 * learnt the other four existed. With nothing pinned, the lists widen to every
 * workspace the credential reaches and the rest of the commands fall back to
 * the account's default one, which is what /api/v1 does when X-Workspace-Id is
 * absent. `ft workspace use <slug>` still pins on purpose.
 */
async function deviceLogin(): Promise<{
  apiKey: string;
  workspaceId?: string;
}> {
  const apiUrl = loadConfig().apiUrl.replace(/\/$/, "");
  // Anonymous client: the device endpoints carry no auth header.
  client.setConfig({ baseUrl: `${apiUrl}/api/v1` });

  const start = unwrap(await postAuthDeviceCode({}));

  console.log(
    `\nOpen ${chalk.cyan(start.verification_uri)} and enter the code:\n` +
      `\n    ${chalk.bold(start.user_code)}\n` +
      `\n${chalk.dim("Opening your browser… (Ctrl+C to cancel)")}\n`,
  );
  openBrowser(start.verification_uri_complete);

  const deadline = Date.now() + start.expires_in * 1000;
  let interval = start.interval;
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    const res = await postAuthDeviceToken({
      body: {
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
    });
    if (res.data) {
      const { access_token, workspaces } = res.data;
      if (workspaces.length > 1) {
        console.log(
          `\n${chalk.dim("Workspaces:")} ${workspaces.map((w) => w.slug).join(", ")}` +
            ` ${chalk.dim("(all of them; narrow with --workspace or `ft workspace use`)")}`,
        );
      }
      return { apiKey: access_token };
    }
    switch (res.error?.error) {
      case "authorization_pending":
        break; // keep polling at the same cadence
      case "slow_down":
        interval += 5; // RFC 8628 §3.5
        break;
      case "access_denied":
        fail("Login was denied in the browser.");
        break;
      case "expired_token":
        fail("The code expired before approval. Run `ft login` again.");
        break;
      default:
        fail(`Device login failed: ${res.error?.error ?? "unknown error"}.`);
    }
  }
  return fail("The code expired before approval. Run `ft login` again.");
}
