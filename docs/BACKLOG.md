# Backlog — FreeTicket CLI

Prioritized backlog for the `ft` CLI. See vision and scope in [PRD.md](./PRD.md).

Priority: **P0** critical · **P1** high · **P2** medium · **P3** opportunistic.
Status: ✅ done · 🟡 in progress · ⬜ pending.

---

## Epic A — Foundations (Phase 1) ✅

| ID | Story | Priority | Status |
|---|---|---|---|
| A1 | As an operator, I install `ft` through npm and see the yellow banner when running it without a command. | P0 | ✅ |
| A2 | As an operator, I run `ft login --key ...` and the key is stored (0600) and verified against `/me`. | P0 | ✅ |
| A3 | As an operator, I run `ft whoami` and see my role and accessible workspaces. | P0 | ✅ |
| A4 | As an operator, I list and inspect details for events/ticket-types/sales/plans/venues/staff. | P0 | ✅ |
| A5 | As an operator, I run `ft reports summary` and export buyers/subscribers. | P1 | ✅ |
| A6 | As an integrator, I use `--json` to pipe clean stdout into `jq`/scripts. | P0 | ✅ |
| A7 | As a multi-workspace operator, I switch orgs with `--workspace` or `FT_WORKSPACE_ID`. | P1 | ✅ |
| A8 | As a maintainer, I regenerate the client from the contract with `pnpm sync-openapi`. | P0 | ✅ |
| A9 | As a maintainer, I have CI (lint/typecheck/test/build) and npm release by tag. | P1 | ✅ |

## Epic B — Quality and DX (v0.2) 🟡

| ID | Story | Priority | Status | Acceptance criteria |
|---|---|---|---|---|
| B1 | As a maintainer, every command has at least one test (unit or smoke). | P1 | ⬜ | Coverage for `src/commands/*`; `cli-qa` reports no gaps. |
| B2 | As an integrator, `--json` is covered by a test that validates parseable JSON output. | P1 | ⬜ | Test runs `JSON.parse` on stdout for a mocked command response. |
| B3 | As an operator, `ft <command> --help` shows usage examples and relevant flags. | P2 | ⬜ | `addHelpText` with examples per command. |
| B4 | As an operator, I see a spinner/status while the API responds on slow commands. | P3 | ⬜ | Indicator does not break `--json` (stderr only). |
| B5 | As an operator with a network error (non-HTTP), I receive a clear message and exit 1. | P1 | ⬜ | Rejected `fetch` → readable message, no raw stack trace. |
| B6 | As a maintainer, a test verifies that `unwrap` maps 401/403/404/501 to the correct hint. | P1 | ⬜ | Test `hintFor`/`unwrap` with synthetic responses. |

## Epic C — Phase 2 writes (v0.3+) 🟡

> **Cross-cutting blocker (C0):** the backend must extract Server Action logic into
> pure services `(ctx: {organizationId, userId, role}) => ...` and replace `501`
> responses with real implementations. Without that, these stories cannot close.

| ID | Story | Priority | Status | Risk |
|---|---|---|---|---|
| C0 | Backend exposes idempotent write services (stops returning 501). | P0 | ⬜ | — |
| C1 | As an ADMIN, I publish an event with `ft events publish <id>`. | P1 | ⬜ | Low |
| C2 | As an ADMIN, I edit event metadata with `ft events update <id> --...`. | P1 | ⬜ | Low |
| C3 | As an ADMIN, I create/edit ticket types and event dates. | P2 | ⬜ | Medium (stock) |
| C4 | As an ADMIN, I create/edit venues and membership plans. | P2 | ⬜ | Medium |
| C5 | As an ADMIN, I invite staff and change roles with interactive confirmation (`--yes` for CI). | P2 | ⬜ | High (permissions) |
| C6 | As an ADMIN, I cancel/refund a sale with double confirmation and `--reason`. | P3 | ⬜ | High (PSP) |

All writes must: ask for confirmation by default (skippable with `--yes`), respect
the minimum role, and report the result with the affected resource id.

## Epic D — Distribution and future (🔮)

| ID | Story | Priority | Status |
|---|---|---|---|
| D1 | As an operator, I install shell completion (`ft completion >> ~/.zshrc`). | P3 | ⬜ |
| D2 | As an operator, I open a resource in the dashboard with `ft open events <id>`. | P3 | ⬜ |
| D3 | As a data user, I export native CSV (`--format csv`) in addition to `--json`. | P3 | ⬜ |
| D4 | As a maintainer, I also publish a standalone binary (without Node) through bundling. | P3 | ⬜ |
| D5 | As a maintainer, a scheduled workflow reports when the backend `openapi.json` changes. | P2 | ⬜ |

---

## Suggested next sprint (v0.2)

Focus on **confidence to publish to npm calmly**: B1, B2, B5, B6 (tests and
errors) + B3 (help with examples). This closes Epic B and prepares the ground to
start C1/C2 as soon as the backend unlocks C0.
