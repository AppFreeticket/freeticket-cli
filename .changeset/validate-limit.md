---
"@freeticket/cli": patch
---

`--limit` en los comandos `list` ahora se valida (entero de 1 a 100) y falla con un mensaje claro, en vez de mandarse tal cual y volver en silencio con la página por defecto de 20.
