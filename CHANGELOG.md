# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.1] - 2026-06-25

### Changed
- Translate package documentation and CLI user-facing text to English.
- Publish under the `@freeticket/cli` npm scope.

## [0.1.0] - 2026-06-25

### Added
- Initial `ft` CLI generated from the OpenAPI 3.1 contract for the B2B API v1.
- API key authentication (`ft login` / `whoami` / `logout` / `config`).
- Read commands: `events`, `ticket-types`, `sales`, `plans`, `venues`, `staff`,
  `reports summary`, `reports export buyers|subscribers`.
- Common flags: `--json`, `--workspace`, `--limit`, `--cursor`, and cursor pagination.
- FreeTicket ASCII banner when running `ft` without a command.
- Claude Code subagents for review and integration (`.claude/agents/`).
