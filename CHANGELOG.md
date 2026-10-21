# Changelog

## 0.11.1

### Patch Changes

- 2fc1604: Sync the bundled OpenAPI contract to v1 1.20.0 and admin 1.5.1 (documented error codes, optional `streamType` and check-in body).

## 0.11.0

### Minor Changes

- 9a37f52: Contract sync: B2B API 1.19.0 and admin API 1.5.0 (was 1.7.0 / 1.3.0).

  New commands for what the API gained since 1.7.0:

  - `ft events cancel <id>` — cancels the event and all its dates while keeping sales and tickets (no refunds). Asks first; `--yes` skips it.
  - `ft sales attempts <id>` — payment attempt history: why a sale did not go through.
  - `ft tickets reassign <code> --data` — moves a sold ticket to another date and/or ticket type (postponements).
  - `ft staff get <id>` and `ft staff delete <id>` — revoke someone's access to this workspace.
  - `ft webhooks update <id>` — edit url/events/active without rotating the signing secret.
  - `ft settlements get <id>`.
  - `ft content-posts create --data` — publish a post or an article.
  - `ft workspace create --name --slug` — create your own workspace.
  - `ft signup --email --name` — create an account from the terminal; verify by email, then `ft login`.
  - `ft admin workspaces plan-show <id>` and `ft admin workspaces delete <id>` (soft delete, asks first).

  `ft tickets checkin` sends the (now required) empty body, so it keeps working against 1.19.

  The update notice works again: the npm registry answered the check with 406, so it never showed. It now looks up the new version while the command runs, and stays quiet with `--json`, `--raw` or `--csv`.

## 0.10.0

### Minor Changes

- 0e8f8ae: Logging in gives you every workspace, not the first one.

  `ft login` used to quietly make `workspaces[0]` the active workspace and write
  it to `~/.freeticket/config.json`. Somebody who belonged to five tenants saw
  one of them and had no reason to suspect the other four existed — every list,
  every report, every empty result was scoped to a workspace nobody chose.

  Now a login pins nothing, and the commands widen to match:

  - `ft <resource> list` reads **every workspace the credential reaches** and tags
    each row with `workspaceId` / `workspaceName`. `--limit` is split between the
    workspaces, so `--limit 20` is still 20 rows and not 20 per tenant.
  - The row-shaped reports — `by-event`, `timeseries`, `inventory`, `financials`,
    `reconciliation` — aggregate the same way. `reports summary` does not: KPIs
    are an object, and adding them up across tenants means nothing.
  - A workspace that errors is reported on stderr and the rest still print.

  Pinning is now opt-in and reversible: `--workspace <id>` for one command,
  `ft workspace use <slug>` to persist it, `ft workspace clear` to go back to all
  of them. A pinned session behaves exactly as before, and pinning is what deep
  pagination needs — `--cursor` now says so instead of silently paging one
  workspace, because a cursor from one workspace means nothing in another.

  Commands that are not lists still resolve to the account's default workspace,
  which is what `/api/v1` does when `X-Workspace-Id` is absent.

- cce7ed4: Several accounts, nested: every list reads all of them by default.

  `ft login` used to replace whatever session was stored, so somebody with two
  FreeTicket logins (their own organization and an agency, say) had to log out
  and back in to look at the other one. Now each login **adds an account** to
  `~/.freeticket/config.json`, named after its email (or `--account <name>`),
  and the others stay.

  - With nothing pinned, `ft <resource> list` and the row-shaped reports read
    **every account × every workspace it reaches**. Rows carry `account` (when
    more than one is involved) next to `workspaceId` / `workspaceName`. A
    workspace two accounts both reach is read once. `--limit` is split across all
    of them, and an account or workspace that fails is named on stderr while the
    rest still print.
  - `ft account list|use|clear|remove` manages them; `--account <name>` narrows any
    command to one, wherever `--workspace` is accepted.
  - Commands that are not lists (`get`, `create`, `update`, `delete`, `tickets checkin`,
    `reports summary`, ...) need exactly one account. With several stored and none
    chosen they stop and name them instead of guessing.
  - `ft whoami` and `ft workspace list` show every account; `ft workspace use`
    finds the workspace in whichever account reaches it and pins both.
  - `ft logout` removes the pinned (or only) account; `--account <name>` and
    `--all` otherwise.

  A config written by an older CLI keeps working: its `apiKey` is read as the
  account `default`, and logging in again replaces it instead of leaving two
  accounts behind (so does re-logging in as a user already stored under another
  name). `FT_API_KEY` still wins over everything and is a single account, so CI
  never fans out across logins stored on the machine; it keeps the workspace
  pinned in the file, and `--account` alongside it is an error.

  If every account fails to answer, the command now fails (exit 1) naming each
  error instead of printing an empty table. An unparsable config file is reported
  instead of being silently overwritten, and the file is written atomically.

## 0.9.0

### Minor Changes

- 921e5f9: Contract 1.7.0 + admin 1.3.0 — the six gaps free-admin closed at once.

  - `ft settlements document <id>` — the comprobante PDF is no longer panel-only.
    The API answers 302 to a private-storage URL, so the command prints the
    **signed link (5 min TTL)** instead of following the redirect and dumping a
    binary into the terminal. `--proof <fileName>` downloads a payment proof
    instead (file names come from `ft settlements list`).
  - `ft events list --status <s> --with-total` — the status filter runs in the
    query (so `--limit` counts rows actually returned, not rows scanned) and
    `--with-total` opts into `page.total`.
  - `ft staff list --workspace-ids <ids>` — staff of up to 25 workspaces in **one**
    call, each row tagged with its workspace, instead of one request per
    workspace. The API intersects the ids against what the credential already
    administers: it never widens scope.
  - `ft sales cancel <id> --data '{"acknowledge_open_payment":true}'` — the
    contract now requires the flag when the payment is still open at the gateway.
    `ft sales refund` gained `acknowledge_manual` the same way.
  - `ft admin workspaces plan <id> --data '{"planSlug":"legend"}'` — assisted
    sale: activates a tier without Stripe self-service. `ft admin workspaces
update` accepts `webTemplate`, `customDomain` and `customDomainVerifiedAt`.
  - `ft workspace list` shows `role` and `access` per workspace: the **effective**
    role there (not the account-wide one) and the enabled sections (`full`,
    `revoked`, or the section list).
  - `GET /me` now returns the **effective role and sections per workspace**; the
    global `role` is deprecated in the contract. Enforcement is the backend's:
    a credential capped in the panel is capped through the CLI too.

- 5291114: Contract 1.5.0 + admin 1.1.0, and two output/exit-code fixes.

  - `ft settlements list` — settlements paid to the organizer (`--event`, `--status`).
    The comprobante PDF is still panel-only; the contract exposes `hasDocument`
    and the file names, not a download URL.
  - `ft reports financials` — per-function P&L (gross, platform fee, facial,
    payment fee, 4x1000, net to settle) plus the linked settlement status. Same
    numbers as the Liquidaciones dashboard, so a finance integration no longer
    has to recompute them from `/sales` + Mercado Pago.
  - `ft admin tokens list|create|revoke` — platform service tokens (PAT), the
    headless credential for `ft admin` in CI.
  - `ft events list --q <text>` — server-side search.
  - Fix: `reports export reconciliation` answers `text/csv`, so its payload is a
    string. It used to go through `JSON.stringify`, which quoted the whole file
    and escaped the newlines as a literal `\n`, breaking Excel/pandas/Sheets.
    CSV payloads are now written verbatim.
  - Fix: a refused or non-confirmable destructive command (`delete`, `revoke`,
    `admin ... suspend`) exits 1 instead of 0, so `ft … delete && next-step` no
    longer runs `next-step`. Without a TTY it fails immediately pointing at
    `--yes` instead of silently doing nothing.
  - `--csv` on every `reports export`, `--json` on `ft login` / `ft config`.

## 0.8.0

### Minor Changes

- 2757bca: Add `ft api-keys create|list|revoke` for self-service API key management. `create` mints a key and prints the plaintext secret once (with a copy-now warning), `list` shows your keys without ever exposing the secret, and `revoke` deletes a key with confirmation.

## 0.7.1

### Patch Changes

- 1bfd455: Automate npm releases through GitHub Actions trusted publishing.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.7.0] - 2026-07-01

### Added

- **Update notice.** `ft` now prints a one-line "update available" hint on
  _stderr_ when a newer `@freeticket/cli` is on npm. Checked at most once a day
  (cached in `~/.freeticket`), interactive terminals only — never on `--json`
  output, pipes, or CI. Opt out with `FT_NO_UPDATE_CHECK=1`.
- **Manageable superadmin auth (`ft admin login|logout|config`)** — save a
  SUPER_ADMIN session with `ft admin login --session <token>` (validated against
  `GET /api/admin/me` before it's stored), inspect it masked with `ft admin
config`, and clear it with `ft admin logout`. No more hand-exporting
  `FT_ADMIN_SESSION` every time (though it still works) (freeticket-cli#20).

### Changed

- **Auth wording is now "session", not "API key"** on the normal path: the
  logged-out error, the 401 hint, `ft logout`, and `ft config` talk about your
  session. `--key` / `FT_API_KEY` remain, framed as CI/headless only
  (freeticket-cli#17).
- Empty `--csv` lists now keep their **header row** when the columns are known,
  so a zero-result export still carries its schema (freeticket-cli#18).
- Documented the real `--json` (data array) vs `--raw` (`{ data, page }`
  envelope) contract across README, changelog, and skill (freeticket-cli#19).

## [0.6.0] - 2026-07-01

### Added

- **Door check-in (`ft tickets`)** — `access <code>` reads a ticket's access
  status, `checkin <code>` admits it at the door (idempotent, prevents double
  entry), `resend <code>` re-sends the confirmation email/QR. Consumes
  `GET/POST /tickets/{code}/access|checkin|resend` (free-admin#172, #173).
- **Create sales (`ft sales create`)** — register comps and programmatic sales
  via `POST /sales` (`--data <json>`) (free-admin#174).
- **`ft sales tickets <id>`** — list the individual tickets/attendees of a sale
  (free-admin#173).
- **Discount codes (`ft discounts`)** — `list`/`create`/`update`/`delete`
  coupons, filterable by `--event`/`--active` (free-admin#176).
- **Webhooks (`ft webhooks`)** — `list`/`create`/`delete` HMAC-signed event
  endpoints (free-admin#177).
- **Subscriptions** — `ft plans subscribers <id>` lists a plan's members and
  `ft subscriptions cancel <id>` cancels a subscription (free-admin#175).
- **Reports** — `ft reports by-event`, `timeseries`, and `inventory`, plus the
  `ft reports export attendees` CSV (free-admin#178, #165, #168).
- **Sales list filters** — `--channel`, `--event`, `--event-date`,
  `--reference`, `--buyer`, `--from`, `--to` on `ft sales list`; matching
  filters on the buyers/attendees exports (free-admin#167, #168).

### Changed

- Regenerated the client from the B2B OpenAPI **1.4.0** contract.

## [0.5.0] - 2026-06-30

### Added

- **Self-service browser login:** `ft login` (no `--key`) now runs the OAuth 2.0
  Device Authorization Grant (RFC 8628) — prints a code, opens the browser, polls
  until you approve, and stores the minted session. Anyone with a FreeTicket
  account can log in without a backend-issued API key. `ft login --key ft_live_…`
  stays for headless CI. Consumes `POST /auth/device/code` + `POST /auth/device/token`
  (free-admin#160).
- **`--all`** on every list command: auto-paginates over the cursor and returns
  the full result set (progress on stderr, data on stdout) (#8).
- **`--columns <a,b,c>` / `--full`** on list commands to control which fields
  reach the table and CSV, instead of only the default view columns (#6).
- **Workspace commands:** `ft workspaces list`, `ft workspace use <id-or-slug>`,
  and workspace shown by name/slug in `ft config` — switch and persist the active
  workspace without editing `~/.freeticket/config.json` (#12).

### Changed

- **`--raw` on lists emits the full `{ data, page }` envelope** so scripts can
  page from stdout alone. `--json` stays the data array only (stable, parseable);
  reach for `--raw` when you need `page.nextCursor` (#10).

### Fixed

- `ticket-types list` now shows `capacity` instead of the non-existent `stock`
  column (no more empty `—` cells) (#6).
- README/skill drift: documented the real `0.4.x`+ behaviour (device flow, write
  ops) and a "version drift" troubleshooting note (#13).

## [0.4.0] - 2026-06-29

### Added

- **Write layer (B2B v1):** every resource now has `create`/`update`/`delete`
  plus resource actions — `events publish`, `sales cancel`/`refund`,
  `staff create`/`set-role`. Bodies via `--data` (inline JSON or `@file.json`);
  `delete` confirms unless `--yes`.
- `event-dates` command group for the nested `/events/{id}/dates` resource
  (`list`/`create <eventId>`, `update`/`delete <eventId> <dateId>`).
- **Admin writes:** `workspaces create`/`update`/`suspend`/`restore`,
  `users update`, `plans create`/`update`, `feature-flags set <key>`,
  `impersonate`/`impersonate-stop`.
- **`--csv`** flag on every list command (B2B + admin) — CSV on stdout for
  spreadsheets/accounting, columns matching the table view.
- `lib/input.ts`: `parseData` (`--data` inline/`@file` JSON) and an interactive
  `confirm` for destructive ops (auto-aborts on non-TTY stdin).
- `toCsv` (RFC 4180 quoting) in `lib/output.ts`.

## [0.3.0] - 2026-06-29

### Added

- Superadmin commands (`ft admin …`) against the separate `/api/admin` contract
  (Admin API v1.0.0): `me`, `workspaces`, `users`, `plans`, `feature-flags`,
  `audit-log` (read-only first pass).
- Second generated client (`src/admin-client/`) via `openapi-ts.admin.config.ts`,
  with its own `client` singleton and auth.
- `configureAdminClient` using a SUPER_ADMIN better-auth session
  (`FT_ADMIN_SESSION`) — the admin contract issues no API key.
- `sync-openapi:admin` script (target `FT_ADMIN_OPENAPI_URL`); `generate` now
  builds both the B2B and admin clients.

## [0.2.0] - 2026-06-29

### Added

- CFO financial reconciliation against B2B contract v1.1.0:
  `ft reports reconciliation` and `ft reports export reconciliation` — cross
  Mercado Pago payment, sale and Siigo invoice with a `match_status` per sale.

## [0.1.1] - 2026-06-25

### Changed

- Translate package documentation and CLI user-facing text to English.
- Publish under the `@freeticket/cli` npm scope.

## [0.1.0] - 2026-06-25

### Added

- Initial `ft` CLI generated from the OpenAPI 3.1 contract for the B2B API v1.
- API key authentication (`ft login` / `whoami` / `logout` / `config`).
- Read commands: `events`, `ticket-types`, `sales`, `plans`, `venues`, `staff`,
  `reports summary`, `reports export buyers|subscribers`.
- Common flags: `--json`, `--workspace`, `--limit`, `--cursor`, and cursor pagination.
- FreeTicket ASCII banner when running `ft` without a command.
- Claude Code subagents for review and integration (`.claude/agents/`).
