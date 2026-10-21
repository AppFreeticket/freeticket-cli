---
"@freeticket/cli": minor
---

Contract sync: B2B API 1.19.0 and admin API 1.5.0 (was 1.7.0 / 1.3.0).

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
