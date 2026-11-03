---
"@freeticket/cli": minor
---

Catch up with the B2B contract 1.36.0 (from 1.24.0).

- **Lineup**: `ft artists search`, `ft events artists set|remove` and `ft events invitations list|resend|cancel`. `set` asks before removing anyone from the lineup and prints `ARTIST_IDS_IGNORED` warnings.
- **Scheduling and presales**: `ft events schedule set|clear` and `ft presale-windows list|create|update|delete` (alias `presales`).
- **Box office and door**: `ft sales transfer`, `ft sales recipient set`, `ft sales abandon`, `ft sales intents` (checkout funnel), `ft tickets checkin-undo`, `ft event-dates courtesy-seats`, `ft event-dates access-close status|sign`, `ft reports live-attendance`, `ft master-qrs` (with `activate`/`deactivate`; the table hides the secret `code`/`url` unless `--full`) and `ft ticket-templates` (with `instantiate`).
- **Access**: `ft events viewers list|add|remove`, `ft events validators list|add`, `ft staff access` (full replace, from flags or `--data`) and `ft staff resend-invite`.
- **Community**: `ft content-posts update|delete|pin|unpin`, `ft content-videos update|delete|publish|unpublish|set-series`, `ft content-series`, `ft content-lives create|update|delete|chat|reset-key`, `ft content-channels`, `ft content-meetups` (with `publish`, `cancel`, `rsvp`, `attendance`), `ft content-moderation`, `ft content-comments` and `ft content-members ban|unban`.
- **Workspace**: `ft products`, `ft organization update|analytics|profile`, `ft website get|set|publish|unpublish` and `ft merch catalog`.

Every operation the contract marks `x-ft-destructive`, and every command that sends email or notifies a whole community (viewer/validator invitations, resend-invite, meetup publish and RSVP decisions), asks for confirmation; `--yes` skips it and without a TTY they refuse. A test fails if a destructive operation of the contract has no such gate. The buyer side of the merch store (place an order, look one up, pay it by card) is left out on purpose: it needs the buyer's session and a Payment Brick token.
