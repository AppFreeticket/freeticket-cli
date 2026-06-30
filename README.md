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

# 3. Start exploring
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
| `ft events list` · `get <id>` | Workspace events | VIEWER |
| `ft ticket-types list` · `get <id>` | Ticket types (`--event-date-id`) | VIEWER |
| `ft sales list` · `get <id>` | Sales (`--status`) | STAFF |
| `ft plans list` · `get <id>` | Membership plans | VIEWER |
| `ft venues list` · `get <id>` | Venues | VIEWER |
| `ft staff list` | Workspace staff | ADMIN |
| `ft reports summary` | KPIs (`--period 7d\|30d\|90d\|1y`) | VIEWER |
| `ft reports export buyers\|subscribers` | Export buyers / subscribers | ADMIN |

> **Write operations** (create/update/delete) are declared in the contract but
> currently return `501`. They are planned for **phase 2**.

### Common flags

| Flag | Applies to | Description |
|---|---|---|
| `--json` | all commands | Raw JSON output, ideal for `jq` and scripts |
| `--workspace <id>` | all commands | Run the command against another workspace |
| `--limit <n>` `--cursor <id>` | list commands | Cursor pagination (1-100, default 20) |

## Configuration

`ft` resolves configuration in this precedence order:

```
flags  >  environment variables  >  ~/.freeticket/config.json  >  defaults
```

| Variable | Default | Description |
|---|---|---|
| `FT_API_URL` | `https://admin.appfreeticket.com` | API base URL (without `/api/v1`) |
| `FT_API_KEY` | — | Your `ft_live_...` key |
| `FT_WORKSPACE_ID` | *home* | Default active workspace |

The `~/.freeticket/config.json` file is created with `0600` permissions (only
your user can read it) because it stores the API key. See [`.env.example`](./.env.example).

## Pagination, errors, and money

- **Pagination:** list responses include `page.nextCursor`. The CLI prints the
  `--cursor <id>` hint to *stderr* so `--json` stays clean on *stdout*.
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
