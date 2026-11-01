---
"@freeticket/cli": minor
---

Dashboard-parity operations (contract 1.25.0): `ft events schedule set|clear`, `ft presale-windows list|create|update|delete` (alias `presales`), `ft sales transfer`, `ft sales recipient set`, `ft tickets checkin-undo` and `ft event-dates courtesy-seats`. Transfer, recipient, check-in undo and presale delete ask for confirmation (`--yes` skips it); a test now fails if any `x-ft-destructive` operation in the contract lacks that gate. New `events update` fields (slug, PULEP, portal visibility, images, genre) and `maxPerCustomer` on dates go through `--data`.
