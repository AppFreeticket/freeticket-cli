---
"@freeticket/cli": minor
---

Several accounts, nested: every list reads all of them by default.

`ft login` used to replace whatever session was stored, so somebody with two
FreeTicket logins (their own organization and an agency, say) had to log out
and back in to look at the other one. Now each login **adds an account** to
`~/.freeticket/config.json`, named after its email (or `--account <name>`),
and the others stay.

- With nothing pinned, `ft <resource> list` and the row-shaped reports read
  **every account × every workspace it reaches**. Rows carry `account` (when
  more than one is involved) next to `workspaceId` / `workspaceName`. A
  workspace two accounts both reach is read once. `--limit` is split across all
  of them, and an account or workspace that fails is named on stderr while the
  rest still print.
- `ft account list|use|clear|remove` manages them; `--account <name>` narrows any
  command to one, wherever `--workspace` is accepted.
- Commands that are not lists (`get`, `create`, `update`, `delete`, `tickets checkin`,
  `reports summary`, ...) need exactly one account. With several stored and none
  chosen they stop and name them instead of guessing.
- `ft whoami` and `ft workspace list` show every account; `ft workspace use`
  finds the workspace in whichever account reaches it and pins both.
- `ft logout` removes the pinned (or only) account; `--account <name>` and
  `--all` otherwise.

A config written by an older CLI keeps working: its `apiKey` is read as the
account `default`. `FT_API_KEY` still wins over everything and is a single
account, so CI never fans out across logins stored on the machine.
