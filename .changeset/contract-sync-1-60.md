---
"@freeticket/cli": patch
---

Sync the committed B2B contract with production: v1 1.55.0 → 1.60.0 (superadmin stays at 1.9.0). `ft settlements get` and `--json` carry `vatAmount`, the VAT included in `grossAmount` on MEMBERSHIP settlements (null on EVENT). No command changes.
