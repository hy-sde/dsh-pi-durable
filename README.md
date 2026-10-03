# dsh-pi-durable

Durable-agent capability for the DeepSeek Harness, delivered as two standalone
`@hy-sde-org` packages (no harness source changes):

| Package | Plane | Role |
| --- | --- | --- |
| [`@hy-sde-org/dsh-pi-durable`](packages/pi-durable) | HOST | Engine: publishes the `piDurableAgent` service — a pi-durable `Harness` over `~/.dsh/storages/pi-agent.sqlite` with an OpenAI-compatible relay provider (`@earendil-works/pi-durable` + `@earendil-works/pi-ai`). |
| [`@hy-sde-org/dsh-tool-pi-durable`](packages/tool-pi-durable) | preset | Model-facing tools (`durable_agent_submit`, `durable_agent_write`, `durable_agent_status`, `durable_agent_history`, `durable_agent_fork`, `durable_agent_abort`) + the `durable-agent` prompt section; resolves the engine service by name. |

## What the durable agent is

A **separate conversation** the model can drive: its own transcript, its own
coding toolset (bash/read/write/edit via `CodingTools` + `NodeExecutionEnv`),
its own durable SQLite storage, and its own model route (the configured
relay). Submissions are exactly-once per `requestId`, every commit is
checkpointed, the process can crash and resume, and conversations fork at any
entry (transcript inherited up to the fork point).

Layering (complementary, zero code overlap):

- **Maka / dsh-graph** — the harness orchestration plane: who promised what,
  who needs waking (work schedule, exactly-once claims, wakes).
- **pi-durable (this plugin)** — how far one conversation got: per-step
  checkpoints, fork-at-entry, durable documents/tasks.
- **celld** (optional substrate, not used here) — did the write reach durable
  proof (RPO=0) across processes.

## Write-only mode

With `baseUrl` unset the engine still runs: passive writes, documents, and
tasks work; `durable_agent_submit` fails loud with
`[pi-durable-not-configured]`. Point `baseUrl` at any OpenAI-compatible
endpoint and set `apiKeyEnv` to enable generation.

## Mounting

Self-contained rows ship in each package's `cordis.patch.yml`
(`dsh.bundle.patch`); `plugin_manager install_bundle` mounts them. To wire by
hand instead: add the engine row to the host composition (it injects nothing
and publishes a service) and the tool row to the preset's `plugins` list —
see the comments in each row file. The packages must resolve in the host
process: publish to npm, or add a relative `file:` dependency to the fork's
`apps/cli/package.json`:

```json
"@hy-sde-org/dsh-pi-durable": "file:../../../dsh-plugins/dsh-pi-durable/packages/pi-durable",
"@hy-sde-org/dsh-tool-pi-durable": "file:../../../dsh-plugins/dsh-pi-durable/packages/tool-pi-durable"
```

## Development

```sh
pnpm install
pnpm --filter @hy-sde-org/dsh-pi-durable check && pnpm --filter @hy-sde-org/dsh-pi-durable test
pnpm build   # container-wide build/check/test via package scripts
```

Engine tests exercise the durable flow over real SQLite (write → close →
reopen → verify, requestId dedup, fork, status) with no model configured.

## License

MIT — see [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
