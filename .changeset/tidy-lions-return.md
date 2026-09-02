---
"@freeticket/cli": minor
---

Contract 1.7.0 + admin 1.3.0 — the six gaps free-admin closed at once.

- `ft settlements document <id>` — the comprobante PDF is no longer panel-only.
  The API answers 302 to a private-storage URL, so the command prints the
  **signed link (5 min TTL)** instead of following the redirect and dumping a
  binary into the terminal. `--proof <fileName>` downloads a payment proof
  instead (file names come from `ft settlements list`).
- `ft events list --status <s> --with-total` — the status filter runs in the
  query (so `--limit` counts rows actually returned, not rows scanned) and
  `--with-total` opts into `page.total`.
- `ft staff list --workspace-ids <ids>` — staff of up to 25 workspaces in **one**
  call, each row tagged with its workspace, instead of one request per
  workspace. The API intersects the ids against what the credential already
  administers: it never widens scope.
- `ft sales cancel <id> --data '{"acknowledge_open_payment":true}'` — the
  contract now requires the flag when the payment is still open at the gateway.
  `ft sales refund` gained `acknowledge_manual` the same way.
- `ft admin workspaces plan <id> --data '{"planSlug":"legend"}'` — assisted
  sale: activates a tier without Stripe self-service. `ft admin workspaces
  update` accepts `webTemplate`, `customDomain` and `customDomainVerifiedAt`.
- `ft workspace list` shows `role` and `access` per workspace: the **effective**
  role there (not the account-wide one) and the enabled sections (`full`,
  `revoked`, or the section list).
- `GET /me` now returns the **effective role and sections per workspace**; the
  global `role` is deprecated in the contract. Enforcement is the backend's:
  a credential capped in the panel is capped through the CLI too.
