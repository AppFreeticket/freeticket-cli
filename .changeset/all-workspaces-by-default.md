---
"@freeticket/cli": minor
---

Logging in gives you every workspace, not the first one.

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
