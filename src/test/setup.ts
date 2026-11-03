import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Global guard for every test file (vitest `setupFiles`, runs before the file
 * imports anything):
 *
 * - `HOME` points at a fresh temp dir, so `~/.freeticket/config.json` (and the
 *   update-check cache) are never the developer's real accounts. config.ts
 *   reads `homedir()` at import time, which is why this has to run first.
 * - `FT_API_URL` is a closed local port, and the FT_* credentials of the shell
 *   are dropped: a test that forgets to mock still cannot authenticate against
 *   a real backend.
 * - `fetch` throws. A test that needs the network stubs it (`vi.stubGlobal`,
 *   or a `fetch` in the client config); restoring the stub comes back here,
 *   not to the real fetch.
 */
const home = mkdtempSync(join(tmpdir(), "ft-cli-test-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.FT_API_URL = "http://127.0.0.1:9";
for (const name of ["FT_API_KEY", "FT_WORKSPACE_ID", "FT_ADMIN_SESSION"])
  delete process.env[name];
process.env.FT_NO_UPDATE_CHECK = "1";

globalThis.fetch = (async (input: unknown) => {
  const url = input instanceof Request ? input.url : String(input);
  throw new Error(
    `Unexpected network call in a test: ${url}. Stub fetch (vi.stubGlobal) or mock the SDK.`,
  );
}) as typeof fetch;
