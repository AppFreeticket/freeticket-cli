# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

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
