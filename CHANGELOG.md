# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.1.0/);
versionado [SemVer](https://semver.org/lang/es/).

## [Unreleased]

### Added
- CLI inicial `ft` generado desde el contrato OpenAPI 3.1 de la API B2B v1.
- Autenticación por API key (`ft login` / `whoami` / `logout` / `config`).
- Lecturas: `events`, `ticket-types`, `sales`, `plans`, `venues`, `staff`,
  `reports summary`, `reports export buyers|subscribers`.
- Flags comunes `--json`, `--workspace`, `--limit`, `--cursor` y paginación por cursor.
- Banner ASCII de FreeTicket al ejecutar `ft` sin comando.
- Subagentes de Claude Code para revisión e integración (`.claude/agents/`).
