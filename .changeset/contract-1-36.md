---
"@freeticket/cli": minor
---

Catch up with the B2B contract 1.36.0 (from 1.24.0).

- **Lineup**: `ft artists search`, `ft events artists set|remove` and `ft events invitations list|resend|cancel`. `set` asks before removing anyone from the lineup or emailing `--invite` invitations, and prints `ARTIST_IDS_IGNORED` warnings.
- **Scheduling and presales**: `ft events schedule set|clear` and `ft presale-windows list|create|update|delete` (alias `presales`).
- **Box office and door**: `ft sales transfer`, `ft sales recipient set`, `ft sales abandon`, `ft sales intents` (checkout funnel), `ft tickets checkin-undo`, `ft event-dates courtesy-seats`, `ft event-dates access-close status|sign`, `ft reports live-attendance`, `ft master-qrs` (with `activate`/`deactivate`) and `ft ticket-templates` (with `instantiate`).
- **Access**: `ft events viewers list|add|remove`, `ft events validators list|add`, `ft staff access` (full replace, from flags or from `--data`, not both) and `ft staff resend-invite`.
- **Community**: `ft content-posts update|delete|pin|unpin`, `ft content-videos update|delete|publish|unpublish|set-series`, `ft content-series`, `ft content-lives create|update|delete|chat|reset-key`, `ft content-channels`, `ft content-meetups` (with `publish`, `cancel`, `rsvp`, `attendance`), `ft content-moderation`, `ft content-comments` and `ft content-members ban|unban`.
- **Workspace**: `ft products`, `ft organization update|analytics|profile`, `ft website get|set|publish|unpublish` and `ft merch catalog`.

Confirmation: every operation the contract marks `x-ft-destructive` asks first, and so do `events viewers add`, `events validators add`, `events invitations resend`, `events artists set --invite`, `staff resend-invite`, `content-meetups publish`, `content-meetups rsvp`, `content-videos publish` (they email or notify people) and `website set` (a full replace). `--yes` skips the question; without a TTY they refuse. `content-moderation approve`, `tickets resend`, `content-posts create` and `products update` notify without asking, on purpose. Tests check that each gated command refuses without `--yes` and calls its operation with it, and that no `x-ft-destructive` operation of the contract is left without a gate.

Master QR secrets: `ft master-qrs list` and `update` leave the secret `code` and `url` out, in the table and in `--json`, unless `--full`. `create` prints them, because you need them to print the QR.

Flag validation: COP amounts, capacities and pages (`ticket-templates instantiate --price/--capacity`, `presale-windows --capacity`, `content-moderation --page`) take whole numbers only, `--limit` on `artists search` and `sales intents` an integer from 1 to 100, and `--active` (presale windows, `discounts list`) and `--attended` only `true` or `false`. `50.000`, `1,000`, `abc` or `yes` exit 1 before any request instead of being sent as 50, NaN/null or false.

The buyer side of the merch store (place an order, look one up, pay it by card) and the buyer API (`/customer/*`) are left out on purpose: they need a buyer session or a Payment Brick token.
