---
"@freeticket/cli": minor
---

New `ft admin crm` commands for the master CRM (admin contract 1.7.0): list and inspect campaigns, search shows and dates, read options and the WhatsApp quota, preview an audience, launch a campaign (`--ignore-window` to send WhatsApp now outside 9:00-20:00), send or stop WhatsApp batches and cancel a scheduled campaign. Every write previews its target and asks for confirmation (`--yes` in scripts), none is retried automatically, and `PAYLOAD_TOO_LARGE` (413) is explained.
