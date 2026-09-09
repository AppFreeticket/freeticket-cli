---
"@freeticket/cli": minor
---

Contract 1.5.0 + admin 1.1.0, and two output/exit-code fixes.

- `ft settlements list` — settlements paid to the organizer (`--event`, `--status`).
  The comprobante PDF is still panel-only; the contract exposes `hasDocument`
  and the file names, not a download URL.
- `ft reports financials` — per-function P&L (gross, platform fee, facial,
  payment fee, 4x1000, net to settle) plus the linked settlement status. Same
  numbers as the Liquidaciones dashboard, so a finance integration no longer
  has to recompute them from `/sales` + Mercado Pago.
- `ft admin tokens list|create|revoke` — platform service tokens (PAT), the
  headless credential for `ft admin` in CI.
- `ft events list --q <text>` — server-side search.
- Fix: `reports export reconciliation` answers `text/csv`, so its payload is a
  string. It used to go through `JSON.stringify`, which quoted the whole file
  and escaped the newlines as a literal `\n`, breaking Excel/pandas/Sheets.
  CSV payloads are now written verbatim.
- Fix: a refused or non-confirmable destructive command (`delete`, `revoke`,
  `admin ... suspend`) exits 1 instead of 0, so `ft … delete && next-step` no
  longer runs `next-step`. Without a TTY it fails immediately pointing at
  `--yes` instead of silently doing nothing.
- `--csv` on every `reports export`, `--json` on `ft login` / `ft config`.
