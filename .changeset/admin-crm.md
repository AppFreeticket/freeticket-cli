---
"@freeticket/cli": minor
---

New `ft admin crm` commands for the master CRM (admin contract 1.8.0): list and inspect campaigns, search shows and dates, read options and the WhatsApp quota, preview an audience, launch a campaign (`--ignore-window` to send WhatsApp now outside 9:00-20:00), send or stop WhatsApp batches and cancel a scheduled campaign. SUPER_ADMIN only. Every write previews its target and asks for confirmation (`--yes` in scripts; no TTY and no `--yes` refuses), none is retried: a 5xx or a dropped connection on a write reports the outcome as unknown and points at `campaigns list` instead of suggesting a retry. Audience filters must be v2 (`"version": 2`) and are checked before anything is sent. `PAYLOAD_TOO_LARGE` (413) and `RATE_LIMITED` (429) are explained. The bundled admin contract moves to 1.8.0 (adds the `MERCH_MANAGER` staff role).
