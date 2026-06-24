# Agentes del repo `freeticket-cli`

Subagentes de Claude Code para la revisión e integración continua de este CLI.
Cada uno tiene un disparador claro; no hay agentes de relleno.

| Agente | Cuándo usarlo |
|---|---|
| [`ts-cli-reviewer`](./ts-cli-reviewer.md) | Revisar un PR o cambio en `src/` antes de mergear. |
| [`openapi-sync`](./openapi-sync.md) | El backend cambió la API; regenerar y validar el cliente. |
| [`cli-qa`](./cli-qa.md) | Antes de publicar o al agregar un comando: tests e integración. |
| [`release-devops`](./release-devops.md) | Preparar y verificar un release a npm. |

Invocación: en Claude Code, el agente se elige por su disparador o con el
selector de subagentes. Todos operan dentro de este repo.
