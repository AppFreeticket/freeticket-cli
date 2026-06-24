# Backlog — FreeTicket CLI

Backlog priorizado del CLI `ft`. Ver visión y alcance en [PRD.md](./PRD.md).

Prioridad: **P0** crítico · **P1** alto · **P2** medio · **P3** oportunista.
Estado: ✅ hecho · 🟡 en progreso · ⬜ pendiente.

---

## Épica A — Fundaciones (Fase 1) ✅

| ID | Historia | Prioridad | Estado |
|---|---|---|---|
| A1 | Como operador, instalo `ft` por npm y veo el banner amarillo al ejecutarlo sin comando. | P0 | ✅ |
| A2 | Como operador, hago `ft login --key …` y la key se guarda (0600) y se verifica contra `/me`. | P0 | ✅ |
| A3 | Como operador, consulto `ft whoami` y veo mi rol y workspaces accesibles. | P0 | ✅ |
| A4 | Como operador, listo y veo el detalle de events/ticket-types/sales/plans/venues/staff. | P0 | ✅ |
| A5 | Como operador, consulto `ft reports summary` y exporto buyers/subscribers. | P1 | ✅ |
| A6 | Como integrador, uso `--json` para pipear a `jq`/scripts con stdout limpio. | P0 | ✅ |
| A7 | Como operador multi-workspace, cambio de org con `--workspace` o `FT_WORKSPACE_ID`. | P1 | ✅ |
| A8 | Como mantenedor, regenero el cliente desde el contrato con `pnpm sync-openapi`. | P0 | ✅ |
| A9 | Como mantenedor, tengo CI (lint/typecheck/test/build) y release a npm por tag. | P1 | ✅ |

## Épica B — Calidad y DX (v0.2) 🟡

| ID | Historia | Prioridad | Estado | Criterios de aceptación |
|---|---|---|---|---|
| B1 | Como mantenedor, cada comando tiene al menos un test (unit o smoke). | P1 | ⬜ | Cobertura de `src/commands/*`; `cli-qa` no reporta gaps. |
| B2 | Como integrador, `--json` está cubierto por un test que valida que el output es JSON parseable. | P1 | ⬜ | Test que hace `JSON.parse` del stdout en un comando con respuesta mockeada. |
| B3 | Como operador, `ft <comando> --help` muestra ejemplos de uso y los flags relevantes. | P2 | ⬜ | `addHelpText` con ejemplos por comando. |
| B4 | Como operador, veo un spinner/estado mientras la API responde en comandos lentos. | P3 | ⬜ | Indicador no rompe `--json` (va a stderr). |
| B5 | Como operador con error de red (no HTTP), recibo un mensaje claro y exit 1. | P1 | ⬜ | `fetch` rechazado → mensaje legible, no stack trace crudo. |
| B6 | Como mantenedor, un test verifica que `unwrap` mapea 401/403/404/501 al hint correcto. | P1 | ⬜ | Test de `hintFor`/`unwrap` con respuestas sintéticas. |

## Épica C — Escrituras Fase 2 (v0.3+) 🟡

> **Bloqueante transversal (C0):** el backend debe extraer la lógica de los Server
> Actions a servicios puros `(ctx: {organizationId, userId, role}) => …` y cambiar el
> `501` por implementación real. Sin eso, estas historias no se pueden cerrar.

| ID | Historia | Prioridad | Estado | Riesgo |
|---|---|---|---|---|
| C0 | Backend expone servicios de escritura idempotentes (deja de responder 501). | P0 | ⬜ | — |
| C1 | Como ADMIN, publico un evento con `ft events publish <id>`. | P1 | ⬜ | Bajo |
| C2 | Como ADMIN, edito metadata de un evento con `ft events update <id> --…`. | P1 | ⬜ | Bajo |
| C3 | Como ADMIN, creo/edito tipos de ticket y fechas de evento. | P2 | ⬜ | Medio (stock) |
| C4 | Como ADMIN, creo/edito venues y planes de membresía. | P2 | ⬜ | Medio |
| C5 | Como ADMIN, invito staff y cambio roles con confirmación interactiva (`--yes` para CI). | P2 | ⬜ | Alto (permisos) |
| C6 | Como ADMIN, cancelo/reembolso una venta con doble confirmación y `--reason`. | P3 | ⬜ | Alto (PSP) |

Todas las escrituras deben: pedir confirmación por defecto (saltable con `--yes`),
respetar el rol mínimo, y reportar el resultado con el id del recurso afectado.

## Épica D — Distribución y futuro (🔮)

| ID | Historia | Prioridad | Estado |
|---|---|---|---|
| D1 | Como operador, instalo autocompletado de shell (`ft completion >> ~/.zshrc`). | P3 | ⬜ |
| D2 | Como operador, abro un recurso en el dashboard con `ft open events <id>`. | P3 | ⬜ |
| D3 | Como data, exporto a CSV nativo (`--format csv`) además de `--json`. | P3 | ⬜ |
| D4 | Como mantenedor, publico también como binario standalone (sin Node) vía bundling. | P3 | ⬜ |
| D5 | Como mantenedor, un workflow programado avisa si el `openapi.json` del backend cambió. | P2 | ⬜ |

---

## Próximo sprint sugerido (v0.2)

Foco en **confianza para publicar a npm con tranquilidad**: B1, B2, B5, B6 (tests y
errores) + B3 (ayuda con ejemplos). Cierra la Épica B y deja el terreno listo para
empezar C1/C2 en cuanto el backend desbloquee C0.
