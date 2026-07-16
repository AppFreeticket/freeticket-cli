---
"@freeticket/cli": minor
---

Add `ft api-keys create|list|revoke` for self-service API key management. `create` mints a key and prints the plaintext secret once (with a copy-now warning), `list` shows your keys without ever exposing the secret, and `revoke` deletes a key with confirmation.
