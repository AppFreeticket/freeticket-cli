# PRD — FreeTicket CLI (`ft`)

> Product document for the FreeTicket command-line client.
> Global status: **Phase 1 (reads) ✅ published**. Phase 2 (writes) 🟡 in design.
> Last updated: 2026-06-24 · Version: 1.0

Status legend: ✅ done · 🟡 in progress/planned · ⛔ cut · 🔮 future.

---

## 1. Summary

`ft` is the official FreeTicket terminal client. It consumes the **B2B REST API v1**
(`/api/v1`) and lets organizers, artists, and venues inspect and, in phase 2,
operate their workspace without opening the web dashboard. The client is
**generated from the OpenAPI 3.1 contract**, so it never drifts out of sync with
the API.

Repo: `github.com/AppFreeticket/freeticket-cli` · npm package `@freeticket/cli`
· binary `ft`.

## 2. Problem and opportunity

- Advanced operators (producers with many events, technical teams) need **fast,
  repeatable, scriptable queries** that the dashboard does not provide: exporting
  buyers into a pipeline, checking sales in CI, auditing KPIs through cron.
- The B2B API already exists and is documented; what is missing is an ergonomic
  consumption surface that makes it useful without hand-writing `curl`.
- A CLI generated from OpenAPI is **cheap to maintain**: every new backend
  endpoint becomes a command with `pnpm sync-openapi`.

## 3. Users and use cases

| User | API role | Typical use case |
|---|---|---|
| Producer / organizer | ADMIN | Export buyers and subscribers; review sales; KPIs by period. |
| Technical / data team | ADMIN/VIEWER | Pipe `--json` into `jq`/scripts; scheduled audits; custom dashboards. |
| Box office staff | STAFF | Query sales and their status. |
| External integrator | Depends on key | Build automations on top of the API without touching the dashboard. |

## 4. Goals and success metrics

- **O1 — Adoption:** an operator can go from `npm i -g` to `ft whoami` in < 2 min.
- **O2 — Read coverage:** 100% of API `GET` endpoints are exposed as commands.
- **O3 — Sync:** 0 drift between the published CLI and the backend `openapi.json`
  (guaranteed by codegen + typecheck in CI).
- **O4 — Scriptability:** every output is available through parseable `--json`, with clean stdout.

North-star metric: **commands run / week** per active workspace.

## 5. Scope

### Phase 1 — Reads ✅ (published)

| Capability | Status |
|---|---|
| API key authentication (`login`/`whoami`/`logout`/`config`) | ✅ |
| `events list|get` | ✅ |
| `ticket-types list|get` (`--event-date-id`) | ✅ |
| `sales list|get` (`--status`) | ✅ |
| `plans list|get` | ✅ |
| `venues list|get` | ✅ |
| `staff list` | ✅ |
| `reports summary` (`--period`) | ✅ |
| `reports export buyers|subscribers` | ✅ |
| Flags `--json` / `--workspace` / `--limit` / `--cursor` | ✅ |
| Yellow brand ASCII banner | ✅ |
| `~/.freeticket/config.json` config (0600) + env vars | ✅ |
| Client generated from OpenAPI + sync script | ✅ |
| Review/integration subagents + CI + npm release | ✅ |

### Phase 2 — Writes 🟡 (in design)

Enable the `POST/PATCH/DELETE` endpoints that return `501` today. This depends on
the **backend** extracting Server Action logic into pure services that accept
`{ organizationId, userId, role }`. Proposed order by increasing risk:

1. 🟡 `events publish` + `events update` (metadata changes, low risk).
2. 🟡 `ticket-types create|update` and `event-dates create|update`.
3. 🟡 `venues create|update`, `plans create|update`.
4. 🟡 `staff invite` + `staff role` (touches permissions, requires confirmations).
5. 🟡 `sales cancel|refund` (touches payment provider, maximum caution).

### Out of scope ⛔

- **Checkout / sale creation** (stock + payment + reservations): remains in the web flow.
- **Complex event creation** (templates + artist invitations).
- **Refunds that touch the PSP** without a dedicated idempotent backend service.
- Fan membership management (Stripe) and any B2C flow.

## 6. Functional requirements

- **FR1** The CLI resolves config with `flags > env > ~/.freeticket/config.json > defaults` precedence.
- **FR2** Every call injects `Authorization: Bearer` + `X-Workspace-Id` (when a workspace exists).
- **FR3** Lists paginate by cursor; the `--cursor` hint is printed to **stderr**.
- **FR4** API errors (`{error:{code,message,details}}`) are translated into
  actionable messages and exit with code `1`. Covered codes: 401/403/404/422/501/500.
- **FR5** `--json` dumps raw JSON to **stdout** without contamination (banner/hints to stderr).
- **FR6** `ft` with no command shows banner + help; `ft --version` reports the package version.

## 7. Non-functional requirements

- **NFR1 — Security:** the API key is stored with mode `0600`, is never logged,
  is never printed unmasked, and is never committed.
- **NFR2 — Sync:** `src/client/` is generated and gitignored; CI regenerates it,
  and typecheck fails if an `operationId` disappears.
- **NFR3 — Portability:** Node >= 20; ESM binary with shebang; installable through npm/npx.
- **NFR4 — Maintainability:** resource commands share a single factory (`resource.ts`).
- **NFR5 — Versioning:** SemVer; the CLI version does not track the API version (`/api/v1`).

## 8. Architecture (summary)

`openapi.json` (committed contract) → `@hey-api/openapi-ts` generates `src/client/` →
`commander` commands in `src/commands/` inject headers from `src/lib/config.ts`,
unwrap with `src/lib/api.ts` (`unwrap`), and print through `src/lib/output.ts`.
Details in the [README](../README.md).

## 9. Release and operations

- CI (`ci.yml`): lint + typecheck + test + build on every PR and push to `main`.
- Release (`release.yml`): `npm publish` triggered by `v*` tags (`NPM_TOKEN` secret).
- Backend sync: `pnpm sync-openapi` downloads the spec and regenerates; the
  `openapi.json` diff documents the contract change.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Backend breaking change silently breaks the CLI | Codegen + typecheck in CI; `openapi-sync` agent classifies the diff. |
| API key leak | `0600` mode, masked in `config`, never in logs or git. |
| Write operations (phase 2) with side effects (payments) | Blocked until the backend exposes idempotent services; ordered by risk. |
| Drift between published version and contract | `openapi.json` committed as source of truth; release always regenerates. |

## 11. Roadmap

- ✅ **v0.1** — Phase 1 (reads) published.
- 🟡 **v0.2** — Quality: command tests, richer `ft --help`, table/output improvements.
- 🟡 **v0.3+** — Phase 2 writes, endpoint by endpoint according to §5, behind confirmations.
- 🔮 **future** — shell completion, `ft open` (dashboard deep link), native CSV output.
