import { spawn } from "node:child_process";
import chalk from "chalk";
import type { Command } from "commander";
import { client } from "../client/client.gen";
import {
  getMe,
  postAuthDeviceCode,
  postAuthDeviceToken,
} from "../client/sdk.gen";
import {
  accountsInScope,
  configureClient,
  describeError,
  fail,
  failIfNoneAnswered,
  unwrap,
} from "../lib/api";
import {
  CONFIG_PATH,
  DEFAULT_API_URL,
  LEGACY_ACCOUNT,
  loadConfig,
  loginTarget,
  readConfig,
  saveAccount,
  saveConfig,
} from "../lib/config";
import { print } from "../lib/output";

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description(
      "Log in via the browser (device flow) and add the account to ~/.freeticket/config.json",
    )
    .option(
      "--account <name>",
      "store this login under <name> (default: the account's email); an existing one with that name is replaced",
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
      const apiUrl: string =
        opts.url ??
        process.env.FT_API_URL ??
        readConfig().apiUrl ??
        DEFAULT_API_URL;

      // Browser device flow is the default; --key stays for headless/CI.
      const apiKey: string = opts.key ?? (await deviceLogin(apiUrl));
      const workspaceId: string | undefined = opts.workspace;

      // Verify the credential against /me before storing anything: a bad key
      // must not replace a good login of the same name.
      configureClient(workspaceId, {
        name: opts.account ?? LEGACY_ACCOUNT,
        apiUrl,
        apiKey,
        workspaceId,
      });
      const me = unwrap(await getMe({})).data;
      // Adds this one account, or replaces the stored one of the same user;
      // every other login stays.
      const { name, replaces } = loginTarget(
        readConfig(),
        me.email,
        opts.account,
      );
      saveAccount(
        name,
        {
          apiKey,
          ...(me.email ? { email: me.email } : {}),
          ...(opts.url ? { apiUrl: opts.url } : {}),
          ...(workspaceId ? { workspaceId } : {}),
        },
        replaces,
      );
      // stderr so `ft login --json | jq` stays parseable.
      console.error(
        `${chalk.green("✓")} Account ${chalk.bold(name)} saved in ${chalk.dim(CONFIG_PATH)}`,
      );
      const { activeAccount, accounts } = readConfig();
      if (activeAccount && activeAccount !== name) {
        console.error(
          chalk.dim(
            `(account ${activeAccount} is pinned: \`ft account clear\` reads all of them, \`ft account use ${name}\` switches)`,
          ),
        );
      } else if (Object.keys(accounts ?? {}).length > 1) {
        console.error(
          chalk.dim(
            "(lists now read every stored account; narrow with --account or `ft account use`)",
          ),
        );
      }
      print(me, { json: opts.json });
    });

  program
    .command("whoami")
    .description(
      "Show the authenticated user and workspaces (GET /me), for every account in scope",
    )
    .option("--account <name>", "only this account (default: all stored)")
    .option("--json", "raw JSON output")
    .action(async (opts) => {
      const accounts = accountsInScope();
      if (accounts.length <= 1) {
        configureClient();
        const me = unwrap(await getMe({})).data;
        print(me, { json: opts.json });
        return;
      }
      const all = [];
      const errors: string[] = [];
      for (const account of accounts) {
        configureClient(undefined, account);
        const res = await getMe({});
        if (!res.data) {
          // One expired login does not hide the others.
          errors.push(`account ${account.name}: ${describeError(res)}`);
          continue;
        }
        all.push({ account: account.name, ...res.data.data });
      }
      failIfNoneAnswered(all.length, errors);
      if (opts.json) {
        print(all, { json: true });
        return;
      }
      print(
        all.map((m) => ({
          account: m.account,
          email: m.email,
          name: m.name,
          workspaces: m.workspaces.map((w) => w.slug).join(", "),
        })),
      );
    });

  program
    .command("logout")
    .description(
      "Remove a stored account (the pinned one, or the only one; --account / --all otherwise)",
    )
    .option("--account <name>", "remove this account")
    .option("--all", "remove every stored account")
    .action((opts) => {
      const { accounts = {}, activeAccount } = readConfig();
      const names = Object.keys(accounts);
      if (opts.all) {
        saveConfig({ accounts: {}, activeAccount: undefined });
        console.log(
          `${chalk.green("✓")} Logged out of every account — sessions removed from ${chalk.dim(CONFIG_PATH)}`,
        );
        return;
      }
      const name: string | undefined =
        opts.account ??
        activeAccount ??
        (names.length === 1 ? names[0] : undefined);
      if (names.length === 0) {
        console.log(
          `${chalk.green("✓")} No stored session — nothing to remove.`,
        );
        return;
      }
      if (!name) {
        fail(
          `Several accounts are stored (${names.join(", ")}): say which one to log out of.`,
          "Use `ft logout --account <name>`, or `ft logout --all`.",
        );
      }
      if (!accounts[name]) {
        fail(`No account named "${name}".`, `Stored: ${names.join(", ")}`);
      }
      saveAccount(name, undefined);
      console.log(
        `${chalk.green("✓")} Logged out of ${chalk.bold(name)} — session removed from ${chalk.dim(CONFIG_PATH)}`,
      );
    });

  program
    .command("config")
    .description("Show active configuration (credentials are masked)")
    .option("--json", "raw JSON output")
    .action((opts) => {
      const file = readConfig();
      const cfg = loadConfig();
      print(
        {
          apiUrl: cfg.apiUrl,
          // FT_API_KEY overrides every stored account (CI).
          env: process.env.FT_API_KEY ? mask(process.env.FT_API_KEY) : null,
          activeAccount: file.activeAccount ?? null,
          accounts: Object.entries(file.accounts ?? {}).map(([name, a]) => ({
            name,
            apiUrl: a.apiUrl ?? null,
            // Same field whether it's a device-flow session or a CI API key.
            session: mask(a.apiKey),
            workspaceId: a.workspaceId ?? null,
          })),
        },
        { json: opts.json },
      );
    });
}

/** First characters of a credential: enough to tell two apart, not to use one. */
export function mask(secret: string): string {
  return `${secret.slice(0, 12)}…`;
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
async function deviceLogin(baseUrl: string): Promise<string> {
  const apiUrl = baseUrl.replace(/\/$/, "");
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
      return access_token;
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
