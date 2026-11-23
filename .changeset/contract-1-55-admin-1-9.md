---
"@freeticket/cli": minor
---

Contract sync to v1 1.55.0 and admin 1.9.0. New `ft admin settlements` (list, get, upload, create, regenerate, attach, send, mark-paid, delete) for organizer settlements across workspaces; every write shows the settlement, asks for confirmation (`--yes` in scripts) and sends `confirm: true`. New `ft admin crm test-send`, `suppressions list|add|remove`, `organizations` and `people search`. New `ft courtesy-requests create` for enterprise landings, and `ft settlements list --kind EVENT|MEMBERSHIP` with a `kind` column. Fixes `ft admin users list --workspace` and `ft admin audit-log list --actor`, which were silently ignored.
