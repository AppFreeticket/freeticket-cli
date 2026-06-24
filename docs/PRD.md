# PRD — FreeTicket CLI (`ft`)

> Documento de producto del cliente de línea de comandos de FreeTicket.
> Estado global: **Fase 1 (lecturas) ✅ publicada**. Fase 2 (escrituras) 🟡 en diseño.
> Última actualización: 2026-06-24 · Versión: 1.0

Leyenda de estado: ✅ hecho · 🟡 en progreso/planeado · ⛔ recortado · 🔮 futuro.

---

## 1. Resumen

`ft` es el cliente de terminal oficial de FreeTicket. Consume la **API REST B2B v1**
(`/api/v1`) y permite a organizadores, artistas y venues inspeccionar y —en fase 2—
operar su workspace sin abrir el dashboard web. El cliente se **genera desde el
contrato OpenAPI 3.1** del backend, de modo que el CLI nunca queda desincronizado
con la API.

Repo: `github.com/AppFreeticket/freeticket-cli` · paquete npm `@appfreeticket/cli`
· binario `ft`.

## 2. Problema y oportunidad

- Los operadores avanzados (productoras con muchos eventos, equipos técnicos)
  necesitan **consultas rápidas, repetibles y scriptables** que el dashboard no da:
  exportar compradores a un pipeline, revisar ventas en CI, auditar KPIs por cron.
- La API B2B ya existe y está documentada; falta la **superficie de consumo
  ergonómica** que la haga usable sin escribir `curl` a mano.
- Un CLic generado desde OpenAPI es **barato de mantener**: cada endpoint nuevo del
  backend se vuelve un comando con un `pnpm sync-openapi`.

## 3. Usuarios y casos de uso

| Usuario | Rol API | Caso de uso típico |
|---|---|---|
| Productora / organizador | ADMIN | Exportar compradores y suscriptores; revisar ventas; KPIs por período. |
| Equipo técnico / data | ADMIN/VIEWER | `--json` a `jq`/scripts; auditorías programadas; tableros propios. |
| Staff de taquilla | STAFF | Consultar ventas y su estado. |
| Integrador externo | según key | Construir automatizaciones sobre la API sin tocar el dashboard. |

## 4. Objetivos y métricas de éxito

- **O1 — Adopción:** un operador puede pasar de `npm i -g` a `ft whoami` en < 2 min.
- **O2 — Cobertura de lectura:** 100% de los endpoints `GET` de la API expuestos como comando.
- **O3 — Sincronía:** 0 drift entre el CLI publicado y el `openapi.json` del backend
  (garantizado por codegen + typecheck en CI).
- **O4 — Scriptabilidad:** toda salida disponible en `--json` parseable, stdout limpio.

Métrica norte: **comandos ejecutados / semana** por workspace activo.

## 5. Alcance

### Fase 1 — Lecturas ✅ (publicada)

| Capacidad | Estado |
|---|---|
| Autenticación por API key (`login`/`whoami`/`logout`/`config`) | ✅ |
| `events list|get` | ✅ |
| `ticket-types list|get` (`--event-date-id`) | ✅ |
| `sales list|get` (`--status`) | ✅ |
| `plans list|get` | ✅ |
| `venues list|get` | ✅ |
| `staff list` | ✅ |
| `reports summary` (`--period`) | ✅ |
| `reports export buyers|subscribers` | ✅ |
| Flags `--json` / `--workspace` / `--limit` / `--cursor` | ✅ |
| Banner ASCII amarillo de marca | ✅ |
| Config `~/.freeticket/config.json` (0600) + env vars | ✅ |
| Cliente generado desde OpenAPI + sync script | ✅ |
| Subagentes de revisión/integración + CI + release a npm | ✅ |

### Fase 2 — Escrituras 🟡 (en diseño)

Habilitar los `POST/PATCH/DELETE` que hoy responden `501`. Depende de que el
**backend** extraiga la lógica de los Server Actions a servicios puros que tomen
`{ organizationId, userId, role }`. Orden propuesto por riesgo creciente:

1. 🟡 `events publish` + `events update` (cambios de metadata, bajo riesgo).
2. 🟡 `ticket-types create|update` y `event-dates create|update`.
3. 🟡 `venues create|update`, `plans create|update`.
4. 🟡 `staff invite` + `staff role` (toca permisos — requiere confirmaciones).
5. 🟡 `sales cancel|refund` (toca proveedor de pago — máxima cautela).

### Fuera de alcance ⛔

- **Checkout / creación de ventas** (stock + pago + reservas): vive en el flujo web.
- **Creación compleja de eventos** (plantillas + invitación de artistas).
- **Refunds que toquen el PSP** sin un servicio idempotente dedicado del backend.
- Gestión de membresías de fans (Stripe) y cualquier flujo B2C.

## 6. Requisitos funcionales

- **RF1** El CLI resuelve config con precedencia `flags > env > ~/.freeticket/config.json > defaults`.
- **RF2** Cada llamada inyecta `Authorization: Bearer` + `X-Workspace-Id` (si hay workspace).
- **RF3** Listados paginan por cursor; la pista `--cursor` se imprime en **stderr**.
- **RF4** Errores de la API (`{error:{code,message,details}}`) se traducen a mensajes
  accionables y salen con código `1`. Códigos cubiertos: 401/403/404/422/501/500.
- **RF5** `--json` vuelca JSON crudo a **stdout** sin contaminación (banner/pistas a stderr).
- **RF6** `ft` sin comando muestra banner + ayuda; `ft --version` reporta la versión del paquete.

## 7. Requisitos no funcionales

- **RNF1 — Seguridad:** la API key se guarda con modo `0600` y nunca se loguea ni se
  imprime sin enmascarar; no se commitea jamás.
- **RNF2 — Sincronía:** `src/client/` es generado y gitignored; CI lo regenera y el
  typecheck falla si un `operationId` desaparece.
- **RNF3 — Portabilidad:** Node ≥ 20; binario ESM con shebang; instalable por npm/npx.
- **RNF4 — Mantenibilidad:** comandos de recurso comparten un único factory (`resource.ts`).
- **RNF5 — Versionado:** SemVer; la versión del CLI NO sigue la de la API (`/api/v1`).

## 8. Arquitectura (resumen)

`openapi.json` (contrato commiteado) → `@hey-api/openapi-ts` genera `src/client/` →
comandos `commander` en `src/commands/` que inyectan headers desde `src/lib/config.ts`,
desempaquetan con `src/lib/api.ts` (`unwrap`) e imprimen con `src/lib/output.ts`.
Detalle en el [README](../README.md).

## 9. Release y operación

- CI (`ci.yml`): lint + typecheck + test + build en cada PR y push a `main`.
- Release (`release.yml`): `npm publish` disparado por tag `v*` (secret `NPM_TOKEN`).
- Sync con backend: `pnpm sync-openapi` baja el spec y regenera; el diff de
  `openapi.json` documenta el cambio de contrato.

## 10. Riesgos

| Riesgo | Mitigación |
|---|---|
| Breaking change del backend rompe el CLI en silencio | Codegen + typecheck en CI; agente `openapi-sync` clasifica el diff. |
| Fuga de la API key | Modo `0600`, enmascarado en `config`, nunca en logs ni git. |
| Escrituras (fase 2) con efectos colaterales (pagos) | Bloqueadas hasta que el backend exponga servicios idempotentes; orden por riesgo. |
| Drift entre versión publicada y contrato | `openapi.json` commiteado como fuente de verdad; release siempre regenera. |

## 11. Roadmap

- ✅ **v0.1** — Fase 1 (lecturas) publicada.
- 🟡 **v0.2** — Calidad: tests por comando, `ft --help` rico, mejoras de tabla/salida.
- 🟡 **v0.3+** — Fase 2 escrituras, endpoint por endpoint según §5, detrás de confirmaciones.
- 🔮 **futuro** — autocompletado de shell, `ft open` (deep-link al dashboard), output a CSV nativo.
