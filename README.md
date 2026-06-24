<div align="center">

```
   ___ ___ ___ ___ _____ ___ ___ _  _____ _____
  | __| _ \ __| __|_   _|_ _/ __| |/ / __|_   _|
  | _||   / _|| _|  | |  | | (__| ' <| _|  | |
  |_| |_|_\___|___| |_| |___\___|_|\_\___| |_|
```

# FreeTicket CLI

**Tu plataforma de eventos, desde la terminal.**

Eventos, ventas, tickets, membresías, venues, staff e informes — todo a un comando de distancia.

[![npm](https://img.shields.io/npm/v/@appfreeticket/cli?color=FFD500&label=npm)](https://www.npmjs.com/package/@appfreeticket/cli)
[![CI](https://github.com/AppFreeticket/freeticket-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/AppFreeticket/freeticket-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-07C2BA.svg)](./LICENSE)
[![node](https://img.shields.io/badge/node-%E2%89%A520-07C2BA.svg)](#requisitos)

</div>

---

## ✨ Qué es

`ft` es el cliente de línea de comandos oficial de **FreeTicket**. Consume la
**API REST B2B v1** y te deja inspeccionar y operar tu workspace sin abrir el
dashboard: listar eventos, revisar ventas, exportar compradores, ver KPIs — todo
con salida legible o `--json` para pipelines y scripts.

El cliente se **genera desde el contrato OpenAPI 3.1** del backend, así que cada
endpoint que existe en la API existe como comando, y nunca queda desincronizado.

## 🚀 Instalación

```bash
# global (recomendado)
npm install -g @appfreeticket/cli

# o sin instalar
npx @appfreeticket/cli whoami
```

Comprobá que quedó instalado:

```bash
ft --version
```

## ⚡ Quickstart

```bash
# 1. Emití una API key en el backend (lado servidor):
#    pnpm api:key tu-email@dominio.com
#    → te devuelve una key ft_live_xxxxx (se muestra una sola vez)

# 2. Iniciá sesión (guarda la key en ~/.freeticket/config.json y la verifica)
ft login --key ft_live_xxxxx

# 3. ¿Quién soy y a qué workspaces tengo acceso?
ft whoami

# 4. Empezá a explorar
ft events list
ft reports summary --period 30d
ft sales list --status CONFIRMED --json
```

## 🧭 Comandos

| Comando | Qué hace | Rol mínimo |
|---|---|---|
| `ft login --key <key>` | Guarda y verifica tu API key | VIEWER |
| `ft whoami` | Usuario activo + workspaces accesibles | VIEWER |
| `ft config` · `ft logout` | Ver config (key enmascarada) · borrar key | — |
| `ft events list` · `get <id>` | Eventos del workspace | VIEWER |
| `ft ticket-types list` · `get <id>` | Tipos de ticket (`--event-date-id`) | VIEWER |
| `ft sales list` · `get <id>` | Ventas (`--status`) | STAFF |
| `ft plans list` · `get <id>` | Planes de membresía | VIEWER |
| `ft venues list` · `get <id>` | Venues | VIEWER |
| `ft staff list` | Staff del workspace | ADMIN |
| `ft reports summary` | KPIs (`--period 7d\|30d\|90d\|1y`) | VIEWER |
| `ft reports export buyers\|subscribers` | Exporta compradores / suscriptores | ADMIN |

> Las **escrituras** (crear/editar/borrar) están declaradas en el contrato pero
> responden `501` por ahora — llegan en la **fase 2**.

### Flags comunes

| Flag | Aplica a | Descripción |
|---|---|---|
| `--json` | todos | salida JSON cruda, ideal para `jq` y scripts |
| `--workspace <id>` | todos | ejecuta el comando contra otro workspace |
| `--limit <n>` `--cursor <id>` | listados | paginación por cursor (1–100, default 20) |

## 🔐 Configuración

`ft` resuelve su config en este orden de precedencia:

```
flags  >  variables de entorno  >  ~/.freeticket/config.json  >  defaults
```

| Variable | Default | Descripción |
|---|---|---|
| `FT_API_URL` | `https://admin.appfreeticket.com` | base de la API (sin `/api/v1`) |
| `FT_API_KEY` | — | tu key `ft_live_…` |
| `FT_WORKSPACE_ID` | *home* | workspace activo por defecto |

El archivo `~/.freeticket/config.json` se crea con permisos `0600` (solo tu
usuario lo lee) porque guarda la API key. Mirá [`.env.example`](./.env.example).

## 🧱 Paginación, errores y dinero

- **Paginación:** los listados devuelven `page.nextCursor`. El CLI te imprime la
  pista `--cursor <id>` en *stderr* para que `--json` quede limpio en *stdout*.
- **Errores:** formato uniforme `{ error: { code, message, details } }`. El CLI
  traduce `401/403/404/501` a mensajes accionables y sale con código `1`.
- **Dinero:** número en la moneda del recurso (`currency`, normalmente `COP`).
- **Fechas:** ISO 8601 UTC.

## 🛠️ Desarrollo

```bash
pnpm install
pnpm generate     # genera src/client/ desde openapi.json
pnpm build        # bundle a dist/ con tsup
pnpm test         # vitest
pnpm lint         # biome
```

### Mantener el cliente en sync con el backend

El contrato vive commiteado en [`openapi.json`](./openapi.json). Cuando el backend
cambia la API:

```bash
FT_OPENAPI_URL=https://admin.appfreeticket.com/api/v1/openapi.json pnpm sync-openapi
```

Esto descarga el spec, lo reescribe en `openapi.json` (el diff queda en git como
contrato explícito entre equipos) y regenera `src/client/`. Si un `operationId`
desaparece, TypeScript falla en compilación — el cambio incompatible se ve antes
de mergear.

> `src/client/` es **generado** y está en `.gitignore`: se reconstruye en cada
> build y en CI. No lo edites a mano.

## 📂 Estructura

```
freeticket-cli/
├── openapi.json          # contrato — fuente de verdad versionada
├── src/
│   ├── client/           # generado por @hey-api (gitignored)
│   ├── commands/         # auth, resource (factory), reports
│   ├── lib/              # config, api, output, banner
│   └── index.ts          # registra los comandos (commander)
├── scripts/sync-openapi.ts
└── .claude/agents/       # subagentes de revisión e integración
```

## 🤖 Agentes

El repo trae subagentes de Claude Code en [`.claude/agents/`](./.claude/agents)
para su revisión e integración continua: revisor TS/CLI, sincronizador de
OpenAPI, QA del CLI y release/devops. Ver el [README de agentes](./.claude/agents/README.md).

## Requisitos

- Node.js **≥ 20**
- Una API key de FreeTicket (`ft_live_…`)

## Licencia

[MIT](./LICENSE) © FreeTicket
