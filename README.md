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

The client is **generated from the backend OpenAPI 3.1 contract**, so every
endpoint exposed by the API exists as a command and never drifts out of sync.

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

# 2. Who am I, and which workspaces can I access?
ft whoami

# 3. Pick the workspace you want to operate on (persisted locally).
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
| `ft login` | Browser login (device flow); `--key <key>` for CI | VIEWER |
| `ft whoami` | Active user and accessible workspaces | VIEWER |
| `ft config` · `ft logout` | Show config (masked key) · remove key | — |
| `ft workspace list` · `use <id\|slug>` · `show` | List, switch, and show the active workspace | VIEWER |
| `ft events list` · `get <id>` | Workspace events | VIEWER |
| `ft events create` · `update <id>` · `delete <id>` | Manage events (`--data <json>`) | ADMIN |
| `ft events publish <id>` | Publish an event | ADMIN |
| `ft event-dates list` · `create` · `update` · `delete` | Event dates | ADMIN |
| `ft ticket-types list` · `get <id>` | Ticket types (`--event-date-id`) | VIEWER |
| `ft ticket-types create` · `update <id>` · `delete <id>` | Manage ticket types (`--data <json>`) | ADMIN |
| `ft sales list` · `get <id>` | Sales (filters: `--status` `--channel` `--event` `--event-date` `--reference` `--buyer` `--from` `--to`) | STAFF |
| `ft sales create` | Create a sale/order — comps & programmatic sales (`--data <json>`) | ADMIN |
| `ft sales cancel <id>` · `refund <id>` | Cancel / refund a sale (`--data` for partial refund) | ADMIN |
| `ft sales tickets <id>` | List the individual tickets/attendees of a sale | STAFF |
| `ft tickets access <code>` | Read a ticket's access status (no admit) | STAFF |
| `ft tickets checkin <code>` | Admit a ticket at the door (idempotent) | STAFF |
| `ft tickets resend <code>` | Resend the ticket's confirmation email (QR) | ADMIN |
| `ft plans list` · `get <id>` | Membership plans | VIEWER |
| `ft plans create` · `update <id>` · `delete <id>` | Manage membership plans (`--data <json>`) | ADMIN |
| `ft plans subscribers <id>` | List a plan's subscribers/members | VIEWER |
| `ft subscriptions cancel <id>` | Cancel a subscription | ADMIN |
| `ft discounts list` · `create` · `update <id>` · `delete <id>` | Discount codes / coupons (`--event` `--active`; `--data <json>`) | ADMIN |
| `ft webhooks list` · `create` · `delete <id>` | Webhook endpoints, HMAC-signed delivery (`--data <json>`) | ADMIN |
| `ft venues list` · `get <id>` | Venues | VIEWER |
| `ft venues create` · `update <id>` · `delete <id>` | Manage venues (`--data <json>`) | ADMIN |
| `ft staff list` · `create` · `set-role <id>` | Workspace staff (`--data <json>`) | ADMIN |
| `ft reports summary` | KPIs (`--period 7d\|30d\|90d\|1y`) | VIEWER |
| `ft reports by-event` · `timeseries` · `inventory` | Revenue/tickets by event, over time, and capacity/availability | VIEWER |
| `ft reports export buyers\|attendees\|subscribers` | Export buyers / attendees / subscribers (CSV; filters `--event` `--event-date` `--from` `--to` `--status`) | ADMIN |

> **Write operations** (`create`/`update`/`delete` and actions like `publish`,
> `cancel`, `refund`) send a JSON body via `--data <inline-json>` or
> `--data @file.json`. `delete` prompts for confirmation unless you pass `--yes`.

### Common flags

| Flag | Applies to | Description |
|---|---|---|
| `--json` | all commands | Raw JSON, ideal for `jq`/scripts. On **lists this is the data array only** — use `--raw` for the paginated envelope |
| `--workspace <id>` | all commands | Run the command against another workspace |
| `--limit <n>` `--cursor <id>` | list commands | Cursor pagination (1-100, default 20) |
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
| `FT_API_KEY` | — | CI/headless only — a backend-issued `ft_live_...` token. Browser login (`ft login`) needs no key |
| `FT_WORKSPACE_ID` | *home* | Default active workspace |
| `FT_NO_UPDATE_CHECK` | — | Set to disable the "update available" notice |

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
