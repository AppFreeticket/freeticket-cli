# Agents for the `freeticket-cli` repo

Claude Code subagents for reviewing and continuously integrating this CLI. Each
one has a clear trigger; there are no filler agents.

| Agent | When to use it |
|---|---|
| [`ts-cli-reviewer`](./ts-cli-reviewer.md) | Review a pull request or a change under `src/` before merging. |
| [`openapi-sync`](./openapi-sync.md) | The backend changed a contract; regenerate and validate the client. |
| [`cli-qa`](./cli-qa.md) | Before publishing, or when adding a command: tests and integration. |
| [`release-devops`](./release-devops.md) | Prepare and verify an npm release. |

For cross-repo work (propagating a contract to every client, requesting a
missing endpoint, OSS hygiene), the agents live one level up, in the `ai-native`
umbrella.
