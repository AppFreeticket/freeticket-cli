# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.7.0] - 2026-07-01

### Added
- **Update notice.** `ft` now prints a one-line "update available" hint on
  *stderr* when a newer `@freeticket/cli` is on npm. Checked at most once a day
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
