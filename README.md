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
| `ft artists search <q>` | Find registered artists by name to get the ids a lineup takes (`--limit` `--cursor`) | VIEWER |
| `ft events artists set <eventId> --artist <id>... [--invite <email>...]` | Replace the lineup, in order (unlisted artists are unlinked; asks before removing anyone or emailing `--invite` invitations, `--yes` skips it; ignored ids are shown as `ARTIST_IDS_IGNORED`) | ADMIN |
| `ft events artists remove <eventId> <organizationId>` | Unlink one artist (`--yes` skips the prompt) | ADMIN |
| `ft events invitations list <eventId>` · `resend <eventId> <invitationId>` · `cancel <eventId> <invitationId>` | Invitations sent to artists without an account: list, resend (renews 14 days, sends an email) and cancel; `resend` and `cancel` ask (`--yes`) | ADMIN |
| `ft events schedule set <eventId> --publish-at <iso>` \| `--sale-starts-at <iso>` · `schedule clear <eventId>` | Schedule a DRAFT: publish later, or publish now and open sales later (exactly one flag) · cancel a pending `--publish-at` | ADMIN |
| `ft events viewers list <eventId>` · `add <eventId> --email <e>` · `remove <eventId> <viewerId>` | Read-only viewers of an event's stats; `add` emails the link (and creates a VIEWER account if needed), both `add` and `remove` ask (`--yes`) | ADMIN |
| `ft events validators list <eventId>` · `add <eventId> --name <n> --email <e>` | Door staff of an event (additive; a new account gets an invitation email, so `add` asks, `--yes`) | ADMIN |
| `ft event-dates list` · `create` · `update` · `delete` | Event dates | ADMIN |
| `ft event-dates courtesy-seats <dateId>` | Blocked seats of a numbered date that can be issued as courtesies | ADMIN |
| `ft event-dates access-close status <dateId>` · `sign <dateId>` | Live entry count · sign the access-close record (freezes the count and emails it; IRREVERSIBLE, `--yes`) | STAFF · ADMIN |
| `ft ticket-templates list` · `create` · `update <id>` · `delete <id>` · `instantiate <id> --event-date <id> [--name --price --capacity]` | Reusable ticket type templates; `instantiate` creates a ticket type on a date (`--price`/`--capacity` are whole numbers: `50000`, not `50.000`; `delete` asks, `--yes`) | ADMIN |
| `ft master-qrs list [--full]` · `create` · `update <id>` · `activate <id>` · `deactivate <id>` · `delete <id>` | Master box-office QRs. `code`/`url` are secret and never rotate: `list` and `update` leave them out, `--json` included, unless `--full`; `create` prints them (you need them to print the QR); `delete` asks, `--yes` | ADMIN |
| `ft ticket-types list` · `get <id>` | Ticket types (`--event-date-id`) | VIEWER |
| `ft ticket-types create` · `update <id>` · `delete <id>` | Manage ticket types (`--data <json>`) | ADMIN |
| `ft presale-windows list <ticketTypeId>` · `create <ticketTypeId> --plan --starts-at --ends-at [--capacity --active]` · `update <id>` · `delete <id>` | Membership presale windows (alias `presales`; one per plan; `--capacity` is a whole number or `none`, `--active` is `true`/`false`; `delete` asks, `--yes` skips) | ADMIN |
| `ft sales list` · `get <id>` | Sales (filters: `--status` `--channel` `--event` `--event-date` `--reference` `--buyer` `--from` `--to`) | STAFF |
| `ft sales create` | Create a sale/order — comps & programmatic sales (`--data <json>`) | ADMIN |
| `ft sales cancel <id>` · `refund <id>` | Cancel / refund a sale (`--data` for the `acknowledge_open_payment` / `acknowledge_manual` flags) | ADMIN |
| `ft sales tickets <id>` · `attempts <id>` | Tickets/attendees of a sale · its payment attempt history (why it did not go through) | STAFF |
| `ft sales transfer <saleId> <itemId> --email <email>` | Transfer one ticket to a registered buyer; voids the old QR, once per ticket (`--yes`) | ADMIN |
| `ft sales recipient set <saleId> --name <name> --email <email>` | Correct a courtesy's recipient and resend (a new email voids the old QRs; `--yes`) | ADMIN |
| `ft sales abandon <id>` | Mark a PENDING sale whose payment never started as abandoned; releases its stock (terminal, `--yes`) | ADMIN |
| `ft sales intents --event <id> [--event-date --only-abandoned --limit --cursor]` | Purchase intents: checkout funnel and abandoned journeys (personal data) | VIEWER |
| `ft tickets access <code>` | Read a ticket's access status (no admit) | STAFF |
| `ft tickets checkin <code>` | Admit a ticket at the door (idempotent) | STAFF |
| `ft tickets checkin-undo <code>` | Undo a check-in so the ticket is valid again (idempotent; `--yes`) | ADMIN |
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
| `ft staff access <id> --type admin\|validador\|personalizado\|lectura [--sections --validator-events --viewer-events --expires-at]` | FULL replace of a member's access in this workspace (or the whole body with `--data`, not both; asks, `--yes`) | ADMIN |
| `ft staff resend-invite <id>` | Email the invitation link again (asks, `--yes`) | ADMIN |
| `ft reports summary` | KPIs (`--period 7d\|30d\|90d\|1y`) | VIEWER |
| `ft reports by-event` · `timeseries` · `inventory` | Revenue/tickets by event, over time, and capacity/availability | VIEWER |
| `ft reports export buyers\|attendees\|subscribers\|reconciliation` | Exports as CSV (filters `--event` `--event-date` `--from` `--to` `--status`) | ADMIN |
| `ft reports reconciliation` · `financials` | CFO reconciliation (Mercado Pago vs sale vs Siigo invoice) · per-function P&L | ADMIN |
| `ft reports live-attendance [--scope all\|own\|partner:<orgId>]` | Event dates happening right now, with check-in progress | VIEWER |
| `ft settlements list` · `get <id>` · `document <id>` | Settlements paid to the organizer · signed download URL for the PDF, 5 min TTL (`--proof <fileName>` for a payment proof) | ADMIN |
| `ft content-videos list` · `content-posts list\|create` · `content-lives list\|get\|playback-token` | Organization content; `content-posts create --data` publishes a post or article | ADMIN |
| `ft content-posts update <id>` · `delete <id>` · `pin <id>` · `unpin <id>` | Edit, delete (`--yes`) and pin community posts | ADMIN |
| `ft content-videos update <id>` · `delete <id>` · `publish <id>` · `unpublish <id>` · `set-series <id> --series <id\|none>` · `ft content-series list\|create\|update\|delete\|publish\|unpublish` | On-demand videos and video series (deletes and video `publish`, which notifies members, ask, `--yes`) | ADMIN |
| `ft content-lives create` · `update <id>` · `delete <id>` · `chat <id>` · `reset-key <id>` | Live streams: `create` and `reset-key` print the SECRET stream key once; `delete` and `reset-key` ask (`--yes`) | ADMIN |
| `ft content-channels list` · `create` · `update <id>` · `order <id,id,…>` · `archive <id>` | Community channels (`archive` has no undo, `--yes`) | ADMIN |
| `ft content-meetups list` · `get` · `create` · `update` · `publish <id>` · `cancel <id>` · `rsvp <id> <rsvpId> --approve\|--reject` · `attendance <id> <rsvpId>` | Community meetups; `publish`, `cancel` and `rsvp` notify members, so they ask (`--yes`); `attendance --attended true\|false` | ADMIN |
| `ft content-moderation queue\|bans\|member-posts` · `approve <postId> --expected-updated-at <iso>` · `reject <postId>` · `remove <postId>` · `ft content-comments hide\|unhide\|ignore-reports\|delete <id>` · `ft content-members ban <customerId> --comment <id>` · `unban <customerId>` | Community moderation (`reject`, `remove`, `delete` and `ban` ask, `--yes`; `approve` does not: it is the reviewer's decision and is pinned to `--expected-updated-at`) | STAFF · ADMIN |
| `ft products list` · `get` · `create` · `update` · `delete` · `status <id> --status DRAFT\|PUBLISHED` | Digital products and courses (`--data <json>`; `delete` asks) | ADMIN |
| `ft organization update --data` · `analytics <G-XXXX\|none>` · `profile get\|update` · `ft website get\|set --data\|publish\|unpublish` | Workspace identity, profile, GA4 and public website (`website set` is a FULL replace, so it asks, `--yes`: start from `website get --json`) | ADMIN |
| `ft merch catalog` | Merch store settings and published products with live stock (needs an enterprise service key) | — |
| `ft waitlist list [--city <name>]` · `waitlist create --data` | Per-city waitlist of an enterprise landing (export with personal data); `create` needs an enterprise service key | ADMIN |
| `ft api-keys create <name>` · `list` · `revoke <id>` | Self-service API keys (the secret is shown once, never stored) | ADMIN |
| `ft admin login` · `me` · `workspaces` · `users` · `plans` · `feature-flags` · `tokens` · `audit-log` | Superadmin, cross-tenant — needs a SUPER_ADMIN session, not an API key. Includes `admin workspaces plan <id>` (assisted plan assignment), `plan-show <id>` (current plan) and `delete <id>` (soft delete; suspend first) and `webTemplate` / `customDomain` on `update` | SUPER_ADMIN |

> **Write operations** (`create`/`update`/`delete` and actions like `publish`,
> `cancel`, `refund`) send a JSON body via `--data <inline-json>` or
> `--data @file.json`. `delete` prompts for confirmation unless you pass `--yes`, and so do the
> commands that cannot be taken back or that email or notify people (each
> row says which). Without a TTY and without `--yes` they exit 1 before any
> write. Four notify without asking, on purpose: `tickets resend`,
> `content-posts create`, `products update` and `content-moderation approve`.
> Numeric flags take whole numbers only (`50000`, never
> `50.000` or `50,000`) and boolean flags only `true`/`false`: anything else
> exits 1 before any request.

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
