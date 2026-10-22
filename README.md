<div align="center">

```
   ___ ___ ___ ___ _____ ___ ___ _  _____ _____
  | __| _ \ __| __|_   _|_ _/ __| |/ / __|_   _|
  | _||   / _|| _|  | |  | | (__| ' <| _|  | |
  |_| |_|_\___|___| |_| |___\___|_|\_\___| |_|
```

# FreeTicket CLI

**Your event platform, from the terminal.**

Events, sales, tickets, memberships, venues, staff, and reports — one command away.

[![npm](https://img.shields.io/npm/v/@freeticket/cli?color=FFD500&label=npm)](https://www.npmjs.com/package/@freeticket/cli)
[![CI](https://github.com/AppFreeticket/freeticket-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/AppFreeticket/freeticket-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-07C2BA.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-07C2BA.svg)](#requirements)

</div>

---

## What it is

`ft` is the official command-line client for **FreeTicket**. It consumes the
**B2B REST API v1** and lets you inspect and operate your workspace without
opening the dashboard: list events, review sales, export buyers, check KPIs,
and use readable output or `--json` for pipelines and scripts.

The client is **generated from the backend OpenAPI 3.1 contract**, so the
commands never drift from the API they call: types, parameters and enums all
come from the spec, and a contract change is picked up by regenerating.

## Installation

```bash
# global install (recommended)
npm install -g @freeticket/cli

# or run without installing
npx @freeticket/cli whoami
```

Check that it was installed:

```bash
ft --version
```

## Quickstart

```bash
# 1. Log in through the browser (OAuth device flow). Prints a code, opens your
#    browser, you approve, and the session is stored in ~/.freeticket/config.json.
ft login

# CI / automation: skip the browser with a backend-issued key instead.
#   ft login --key ft_live_xxxxx

# More than one FreeTicket login? Each `ft login` ADDS an account (named after
# its email, or `--account <name>`); the others stay.
#   ft login --account agency

# 2. Who am I, and which workspaces can I access? (one row per account)
ft whoami

# 3. Optional: narrow it down (persisted locally). Without this, the lists and
#    the row-shaped reports read EVERY account and EVERY workspace each one
#    reaches, tagging each row with `workspaceName` (and `account` when there
#    are several). `ft workspace clear` / `ft account clear` unpin.
ft account list
ft account use agency
ft workspace list
ft workspace use my-workspace-slug

# 4. Start exploring
ft events list
ft reports summary --period 30d
ft sales list --status CONFIRMED --json
```

## Commands

| Command | What it does | Minimum role |
|---|---|---|
| `ft signup --email <e> --name <n>` | Create an account (`--workspace-name` also creates the first workspace); verify via email, then `ft login` | — |
| `ft login` | Add an account: browser login (device flow), `--key <key>` for CI, `--account <name>` to name it (default: its email) | VIEWER |
| `ft whoami` | User and accessible workspaces of every account in scope | VIEWER |
| `ft account list` · `use <name>` · `clear` · `remove <name>` | Stored accounts: list, pin one, unpin (read all), remove | — |
| `ft config` · `ft logout` | Show config (masked keys) · remove the pinned/only account (`--account <name>`, `--all`) | — |
| `ft workspace list` · `use <id\|slug>` · `clear` · `show` | List workspaces of every account, pin one (and its account), unpin, show the current one | VIEWER |
| `ft workspace create --name <n> --slug <s>` | Create your own workspace; you become its ADMIN (plan quota applies) | — |
| `ft events list` · `get <id>` | Workspace events (`--q` `--status` `--with-total`) | VIEWER |
| `ft events create` · `update <id>` · `delete <id>` | Manage events (`--data <json>`) | ADMIN |
| `ft events publish <id>` · `cancel <id>` | Publish an event · cancel it and all its dates, keeping sales and tickets (no refunds; `--yes` skips the prompt) | ADMIN |
| `ft event-dates list` · `create` · `update` · `delete` | Event dates | ADMIN |
| `ft ticket-types list` · `get <id>` | Ticket types (`--event-date-id`) | VIEWER |
| `ft ticket-types create` · `update <id>` · `delete <id>` | Manage ticket types (`--data <json>`) | ADMIN |
| `ft sales list` · `get <id>` | Sales (filters: `--status` `--channel` `--event` `--event-date` `--reference` `--buyer` `--from` `--to`) | STAFF |
| `ft sales create` | Create a sale/order — comps & programmatic sales (`--data <json>`) | ADMIN |
| `ft sales cancel <id>` · `refund <id>` | Cancel / refund a sale (`--data` for the `acknowledge_open_payment` / `acknowledge_manual` flags) | ADMIN |
| `ft sales tickets <id>` · `attempts <id>` | Tickets/attendees of a sale · its payment attempt history (why it did not go through) | STAFF |
| `ft tickets access <code>` | Read a ticket's access status (no admit) | STAFF |
| `ft tickets checkin <code>` | Admit a ticket at the door (idempotent) | STAFF |
| `ft tickets resend <code>` | Resend the ticket's confirmation email (QR) | ADMIN |
| `ft tickets reassign <code>` | Move a sold ticket to another date and/or type (`--data '{"eventDateId":"…"}'`; no price difference charged/refunded) | ADMIN |
| `ft plans list` · `get <id>` | Membership plans | VIEWER |
| `ft plans create` · `update <id>` · `delete <id>` | Manage membership plans (`--data <json>`) | ADMIN |
| `ft plans subscribers <id>` | List a plan's subscribers/members | VIEWER |
| `ft subscriptions cancel <id>` | Cancel a subscription | ADMIN |
| `ft discounts list` · `create` · `update <id>` · `delete <id>` | Discount codes / coupons (`--event` `--active`; `--data <json>`) | ADMIN |
| `ft webhooks list` · `create` · `update <id>` · `delete <id>` | Webhook endpoints, HMAC-signed delivery (`--data <json>`) | ADMIN |
| `ft venues list` · `get <id>` | Venues | VIEWER |
| `ft venues create` · `update <id>` · `delete <id>` | Manage venues (`--data <json>`) | ADMIN |
| `ft staff list` · `get <id>` · `create` · `set-role <id>` · `delete <id>` | Workspace staff (`--workspace-ids <ids>` lists up to 25 workspaces in one call; `--data <json>`) | ADMIN |
| `ft reports summary` | KPIs (`--period 7d\|30d\|90d\|1y`) | VIEWER |
| `ft reports by-event` · `timeseries` · `inventory` | Revenue/tickets by event, over time, and capacity/availability | VIEWER |
| `ft reports export buyers\|attendees\|subscribers\|reconciliation` | Exports as CSV (filters `--event` `--event-date` `--from` `--to` `--status`) | ADMIN |
| `ft reports reconciliation` · `financials` | CFO reconciliation (Mercado Pago vs sale vs Siigo invoice) · per-function P&L | ADMIN |
| `ft settlements list` · `get <id>` · `document <id>` | Settlements paid to the organizer · signed download URL for the PDF, 5 min TTL (`--proof <fileName>` for a payment proof) | ADMIN |
| `ft content-videos list` · `content-posts list\|create` · `content-lives list\|get\|playback-token` | Organization content; `content-posts create --data` publishes a post or article | ADMIN |
| `ft api-keys create <name>` · `list` · `revoke <id>` | Self-service API keys (the secret is shown once, never stored) | ADMIN |
| `ft admin login` · `me` · `workspaces` · `users` · `plans` · `feature-flags` · `tokens` · `audit-log` | Superadmin, cross-tenant — needs a SUPER_ADMIN session, not an API key. Includes `admin workspaces plan <id>` (assisted plan assignment), `plan-show <id>` (current plan) and `delete <id>` (soft delete; suspend first) and `webTemplate` / `customDomain` on `update` | SUPER_ADMIN |
| `ft admin crm campaigns` · `batches` · `events` · `options` · `quota` · `preview` · `launch` | Master CRM: email / WhatsApp campaigns to buyers across workspaces. See [`ft admin crm`](#ft-admin-crm) | SUPER_ADMIN |

> **Write operations** (`create`/`update`/`delete` and actions like `publish`,
> `cancel`, `refund`) send a JSON body via `--data <inline-json>` or
> `--data @file.json`. `delete` prompts for confirmation unless you pass `--yes`.

### Common flags

| Flag | Applies to | Description |
|---|---|---|
| `--json` | all commands | Raw JSON, ideal for `jq`/scripts. On **lists this is the data array only** — use `--raw` for the paginated envelope |
| `--workspace <id>` | all commands | Read only this workspace. Lists and row-shaped reports otherwise cover **every workspace you can access**, tagging rows with `workspaceId`/`workspaceName` |
| `--account <name>` | all commands | Use only this stored account. Lists otherwise read **every account** (rows get an `account` column); commands that are not lists need exactly one account, so with several stored they fail until you pass `--account` or `ft account use <name>` |
| `--limit <n>` `--cursor <id>` | list commands | Cursor pagination (1-100, default 20). Across workspaces the limit is split between them; `--cursor` needs a single workspace, since a cursor from one means nothing in another |
| `--all` | list commands | Auto-paginate: fetch every page (ignores `--cursor`) |
| `--raw` | list commands | JSON `{ data, page }` envelope, including `page.nextCursor` for scripted pagination |
| `--columns <a,b,c>` `--full` | list commands | Pick specific columns · show every field |
| `--csv` | list commands | CSV output for spreadsheets/accounting |
| `--data <json>` `--yes` | write commands | JSON body (inline or `@file`) · skip delete confirmation |

## `ft admin crm`

The master CRM for the internal team: email and WhatsApp campaigns to buyers,
across every workspace, against `/api/admin/crm`. It needs a SUPER_ADMIN
credential — `FT_ADMIN_TOKEN` (a service token from `ft admin tokens create`)
or `ft admin login --session`.

```bash
ft admin crm campaigns list [--channel EMAIL|WHATSAPP] [--status S] [--limit N]
ft admin crm campaigns get <id>
ft admin crm campaigns cancel <id> [--yes]
ft admin crm batches next <id> [--ignore-window] [--yes]
ft admin crm batches stop <id> [--yes]
ft admin crm events search <query> [--purpose scope|promote|except] [--sender <workspaceId>]
ft admin crm events dates <eventId...>
ft admin crm options
ft admin crm quota
ft admin crm preview --filter @filter.json [--sender freeticket|<workspaceId>]
ft admin crm launch --data @campaign.json [--yes]
```

**Writes send real messages.** `launch`, `campaigns cancel`, `batches next` and
`batches stop` first show what they are about to touch — `launch` runs the
audience preview with the same filter and sender (total, how many have email
or reachable WhatsApp, the estimated days at the daily quota); the others show
the campaign — and then ask for confirmation. Without a TTY they refuse unless
you pass `--yes`. The CLI never retries a write on its own: if a `launch`
times out, check `campaigns list` before launching again (the backend rejects
the same channel + sender + subject within 10 minutes with
`DUPLICATE_CAMPAIGN` and prints the existing id).

Named errors get a next step: `OUTSIDE_SEND_WINDOW` (WhatsApp sends only
9:00-20:00 Bogotá) prints when the window opens and suggests `--ignore-window`;
`QUOTA_EXHAUSTED` prints when the quota frees up; `INVALID_STATE` means the
campaign no longer allows that action; a 422 lists each `details[].path`.

Find the ids for a filter with `events search` and `events dates`, and the
cities, genre/format codes, plans and WhatsApp templates with `options`.

### `filter.json` (audience filter v2)

```json
{
  "version": 2,
  "scope": { "level": "platform" },
  "include": [
    { "type": "purchased", "eventIds": ["evt_123"], "window": { "kind": "last_days", "days": 90 } }
  ],
  "except": [
    { "type": "received_campaign", "days": 7, "channel": "any" }
  ]
}
```

- `scope` (default `platform`): `{ "level": "orgs", "workspaceIds": [...] }` or
  `{ "level": "events", "eventIds": [...] }`.
- `include` conditions combine with AND; `except` with OR, evaluated across the
  whole platform. Up to 12 per block, 50 ids per list.
- Condition types: `purchased`, `abandoned`, `checked_in` (with optional
  `eventIds`, `dateIds` + `dateEventIds`, `window`), `city` (`cities`),
  `facet` (`dimension`: `genre` | `format`, `codes`), `membership` (`state`:
  `active` | `expiring` | `cancelled`, `withinDays` for `expiring`, `planIds`),
  `spend` (`minCop`, `maxCop`), `received_campaign` (`except` only: `days`,
  `channel`), `people` (`include` only: `emails`).
- `window`: `{ "kind": "any" }` (default), `{ "kind": "last_days", "days": 7|30|90 }`
  or `{ "kind": "range", "from": "2026-09-01", "to": "2026-09-30" }` (Bogotá dates).
- Without a state condition (`purchased`, `abandoned`, `checked_in`,
  `membership`, `people`) in `include`, the audience defaults to confirmed
  buyers plus active members.

### `campaign.json`

```json
{
  "channel": "WHATSAPP",
  "sender": { "kind": "freeticket" },
  "templateName": "promo_show",
  "subject": "New date in Medellín",
  "body": "We just opened a second show. Get your tickets before they are gone.",
  "promotedEventId": "evt_123",
  "filter": {
    "version": 2,
    "include": [{ "type": "purchased", "eventIds": ["evt_123"] }],
    "except": []
  },
  "timing": { "mode": "batches", "firstAt": "2026-11-03T10:00:00-05:00", "batchSize": 50, "perDay": 3, "intervalMinutes": 120 }
}
```

- `sender`: `{ "kind": "freeticket" }` or `{ "kind": "organization", "workspaceId": "..." }`.
  FreeTicket is mandatory when the scope spans the platform, several
  organizations or events of more than one owner (`preview` tells you).
- WhatsApp needs an approved `templateName` (see `options`); email rejects one.
  `imageUrl` for WhatsApp must come from the media library.
- `timing`: `{ "mode": "now" }` (sends on response), `{ "mode": "scheduled", "at": "<ISO with offset>" }`
  or `batches` (WhatsApp only, daily cap 150 when FreeTicket signs, 200 for an
  organization). WhatsApp times are moved into the 9:00-20:00 Bogotá window;
  the response's `scheduledAt` is the real one.

## Configuration

`ft` resolves configuration in this precedence order:

```
flags  >  environment variables  >  ~/.freeticket/config.json  >  defaults
```

| Variable | Default | Description |
|---|---|---|
| `FT_API_URL` | `https://admin.appfreeticket.com` | API base URL (without `/api/v1`) |
| `FT_API_KEY` | — | CI/headless only — a backend-issued `ft_live_...` token. Browser login (`ft login`) needs no key. When set it is the **only** account: stored logins are ignored, nothing fans out across them, and `--account` is rejected. A workspace pinned with `ft workspace use` still applies |
| `FT_WORKSPACE_ID` | *home* | Default active workspace |
| `FT_ADMIN_TOKEN` | — | `ft admin` only — a platform service token (`ft admin tokens create`), sent as `Authorization: Bearer`. Takes precedence over the session cookie |
| `FT_ADMIN_SESSION` | — | `ft admin` only — a SUPER_ADMIN `better-auth.session_token` cookie (same as `ft admin login --session`) |
| `FT_NO_UPDATE_CHECK` | — | Set to disable the "update available" notice (checked at most once a day; also off in CI, without a TTY, and with `--json`/`--raw`/`--csv`) |

Logins are stored per account under `accounts` in `~/.freeticket/config.json`
(`activeAccount` is the one pinned with `ft account use`). A file written by an
older CLI, with a single top-level `apiKey`, is read as the account `default`
and rewritten in the new layout on the next save.

The `~/.freeticket/config.json` file is created with `0600` permissions (only
your user can read it) because it stores your credentials. See [`.env.example`](./.env.example).

## Pagination, errors, and money

- **Pagination:** list responses include `page.nextCursor` / `page.hasMore`. The
  CLI prints the `--cursor <id>` hint to *stderr* so `--json` stays clean on
  *stdout*. Use `--all` to auto-paginate every page, or `--raw` to emit the full
  `{ data, page }` envelope (metadata included) as JSON.
- **Errors:** uniform format `{ error: { code, message, details } }`. The CLI
  translates `401/403/404/501` into actionable messages and exits with code `1`.
- **Money:** number in the resource currency (`currency`, usually `COP`).
- **Dates:** ISO 8601 UTC.

## Development

```bash
pnpm install
pnpm generate     # generates src/client/ from openapi.json
pnpm build        # bundles dist/ with tsup
pnpm test         # vitest
pnpm lint         # biome
```

### Releases

Use `pnpm changeset` for every user-facing CLI change and commit the generated
file in `.changeset/`. Once the change is merged to `main`, GitHub publishes the
new package version to npm automatically with provenance. The version and
changelog update are committed to `main`; no npm token or manual tag is required.

### Keeping the client in sync with the backend

The contract is committed in [`openapi.json`](./openapi.json). When the backend
API changes:

```bash
FT_OPENAPI_URL=https://admin.appfreeticket.com/api/v1/openapi.json pnpm sync-openapi
```

This downloads the spec, rewrites `openapi.json` (the diff becomes the explicit
contract between teams), and regenerates `src/client/`. If an `operationId`
disappears, TypeScript fails during compilation so the breaking change is visible
before merge.

> `src/client/` is **generated** and listed in `.gitignore`: it is rebuilt on
> every build and in CI. Do not edit it by hand.

## Structure

```
freeticket-cli/
├── openapi.json          # contract — versioned source of truth
├── src/
│   ├── client/           # generated by @hey-api (gitignored)
│   ├── commands/         # auth, resource (factory), reports
│   ├── lib/              # config, api, output, banner
│   └── index.ts          # registers commands (commander)
├── scripts/sync-openapi.ts
└── .claude/agents/       # review and integration subagents
```

## Agents

The repo includes Claude Code subagents in [`.claude/agents/`](./.claude/agents)
for continuous review and integration: TypeScript/CLI reviewer, OpenAPI sync,
CLI QA, and release/devops. See the [agents README](./.claude/agents/README.md).

## Requirements

- Node.js **>= 20**
- A FreeTicket account (`ft login` opens the browser; no API key needed)

## License

[MIT](./LICENSE) © FreeTicket
