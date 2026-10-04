<!-- MIRROR-NOTE:START -->
> [!NOTE]
> 📦 This plugin lives in the [**dsh-plugins**](https://github.com/hy-sde/dsh-plugins) monorepo — file issues & pull requests there.
> npm: [`@hy-sde-org/dsh-pi-durable`](https://www.npmjs.com/package/@hy-sde-org/dsh-pi-durable) · [`@hy-sde-org/dsh-tool-pi-durable`](https://www.npmjs.com/package/@hy-sde-org/dsh-tool-pi-durable)
<!-- MIRROR-NOTE:END -->

# dsh-pi-durable — a durable agent conversation for DeepSeek Harness

Durable-agent capability for [DeepSeek
Harness](https://github.com/deepseek-ai/deepseek-harness), delivered as two
standalone `@hy-sde-org` packages (**no harness source changes**): a
**separate conversation** the model can drive — its own transcript, its own
coding toolset (bash/read/write/edit via `CodingTools` +
`NodeExecutionEnv`), its own durable SQLite storage, and its own model route
(the configured relay).

| Identity | Value |
| --- | --- |
| Package (engine) | `@hy-sde-org/dsh-pi-durable` — HOST plane; publishes the `piDurableAgent` service: a pi-durable `Harness` over `~/.dsh/storages/pi-agent.sqlite` with an OpenAI-compatible relay provider (`@earendil-works/pi-durable` + `@earendil-works/pi-ai`) |
| Package (tools) | `@hy-sde-org/dsh-tool-pi-durable` — preset row; the model-facing tools (`durable_agent_submit`, `durable_agent_write`, `durable_agent_status`, `durable_agent_history`, `durable_agent_fork`, `durable_agent_abort`) + the `durable-agent` prompt section; resolves the engine service by name |
| Plugin row ids | `hy-sde-pi-durable`, `hy-sde-tool-pi-durable` (the `hy-sde-` prefix avoids clashing with any shipped row — a duplicate loader id fails the boot) |

> **Based on [pi](https://github.com/franekp/pi) by franekp (MIT)** — the
> durable-agent harness is mounted as the unmodified npm packages
> `@earendil-works/pi-durable` (conversations, exactly-once submissions,
> fork-at-entry, tasks, documents over a SQLite storage backend),
> `@earendil-works/pi-ai` (the model layer: `createProvider`,
> OpenAI-compatible API handlers), and `@earendil-works/chord` (structured
> concurrency contexts). No source from pi is vendored into this repository —
> the adaptation to DeepSeek Harness is exactly the two cordis rows (the cordis
> plugin contract and model-facing tool registration), with **no harness
> source changes**. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## Why

A background run outlives the host that started it: the durable agent keeps
its own transcript in its own durable SQLite storage, every commit is
checkpointed, and the process can crash and resume — a host restart neither
loses the conversation nor forgets how far one run got. Submissions are
exactly-once per `requestId`, so a retry after a crash cannot double-run a
task, and conversations fork at any entry (transcript inherited up to the
fork point), so a divergent branch can be retried without replaying history.
Where the rest of the orchestration plane tracks *who promised what and who
needs waking*, pi-durable tracks *how far one conversation got*: per-step
checkpoints, fork-at-entry, durable documents/tasks.

## Prerequisites

- Node.js `^22.19.0 || >=24.0.0` with npm and pnpm on `PATH`;
- a DeepSeek Harness release carrying the `0.2.0-rc.2` peer range —
  `@deepseek-ai/cordis ~4.0.4` and `@deepseek-ai/dsh-tools ^0.2.0-rc.2` —
  including the standard `dsh` CLI;
- for generation: an OpenAI-compatible relay endpoint (`baseUrl`) and the
  environment variable named by `apiKeyEnv` (default `PI_DURABLE_API_KEY`).
  Without `baseUrl` the engine still installs and runs in **write-only mode**;
- nothing else — the engine owns its own storage medium.

Install the Harness CLI and pnpm before continuing:

```bash
npm install --global @deepseek-ai/dsh pnpm
dsh --version
```

## Quick start

### Route A — published npm packages (recommended)

```bash
dsh plugin --profile web add @hy-sde-org/dsh-pi-durable @hy-sde-org/dsh-tool-pi-durable
```

### Route B — from source (validate this checkout or hack on the plugin)

```bash
git clone git@github.com:hy-sde/dsh-plugins.git
cd dsh-plugins
pnpm install
PI_DURABLE_TGZ="$(cd dsh-pi-durable/packages/pi-durable && pnpm pack --pack-destination /tmp | tail -n 1)"
TOOL_PI_DURABLE_TGZ="$(cd dsh-pi-durable/packages/tool-pi-durable && pnpm pack --pack-destination /tmp | tail -n 1)"
dsh plugin --profile web add "$PI_DURABLE_TGZ" "$TOOL_PI_DURABLE_TGZ"
```

`pnpm pack` runs the normal `prepack` build and produces tarballs containing
`dist/`. A direct `github:<this-repo>` dependency does not contain built output
and is not a supported install path — always install the built tarballs (or
the published packages).

### Verify the composed configuration

```bash
dsh web --dump-config
```

The composed tree must show the `hy-sde-pi-durable` row loading
`@hy-sde-org/dsh-pi-durable` and the `hy-sde-tool-pi-durable` row loading
`@hy-sde-org/dsh-tool-pi-durable`.

### Run

```bash
dsh web
```

Ask the agent to `durable_agent_submit` a self-contained task — the tool
returns a submission id after admission and the run continues in the
background; poll `durable_agent_status`, read the transcript with
`durable_agent_history`, branch at any entry with `durable_agent_fork`, stop
with `durable_agent_abort`. Without a relay configured the engine stays in
write-only mode (see [Configuration](#configuration)).

### Uninstall

```bash
dsh plugin --profile web remove @hy-sde-org/dsh-pi-durable
dsh plugin --profile web remove @hy-sde-org/dsh-tool-pi-durable
```

## What the bundle does

Each package declares a DSH bundle (`dsh.bundle.patch` → `cordis.patch.yml`),
so `dsh plugin` installs both and applies their patches:

1. the engine package inserts the `hy-sde-pi-durable` row — the `piDurableAgent`
   service at the HOST plane. It **injects nothing** from the host: pi-durable
   owns its storage medium, so the row sits at the host plane (a durable,
   process-wide service), not inside a preset.
2. the tool package inserts the `hy-sde-tool-pi-durable` preset row — the six
   `durable_agent_*` tools plus the `durable-agent` prompt section. Without the
   engine service the tools still mount and every call fails loud with
   `[pi-durable-unavailable]` — mounting a preset must never break session
   creation over an optional host.

### What the durable agent is

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

## Configuration

The engine row's `config:` is empty by default. With `baseUrl` unset the
engine still runs: passive writes, documents, and tasks work;
`durable_agent_submit` fails loud with `[pi-durable-not-configured]`. Point
`baseUrl` at any OpenAI-compatible endpoint and set `apiKeyEnv` to enable
generation. Override per deployment by patching the row by id:

```yaml
- id: hy-sde-pi-durable
  config:
    path: /var/lib/dsh/pi-agent.sqlite
    baseUrl: https://relay.internal/v1
    apiKeyEnv: MY_RELAY_KEY
    modelId: my-model
```

The tool row is disabled per deployment the same way
(`hy-sde-tool-pi-durable` → `config.enabled: false`).

## Mounting

The self-contained rows make the `dsh plugin add` quick start enough; this
section is the manual alternative. The row files are each package's
`cordis.patch.yml` (`dsh.bundle.patch`); `plugin_manager install_bundle`
mounts them. To wire by hand instead: add the engine row to the host
composition (it injects nothing and publishes a service) and the tool row to
the preset's `plugins` list — see the comments in each row file. The packages
must resolve in the host process: publish to npm, or add a relative `file:`
dependency to the fork's `apps/cli/package.json`:

```json
"@hy-sde-org/dsh-pi-durable": "file:../../../dsh-plugins/dsh-pi-durable/packages/pi-durable",
"@hy-sde-org/dsh-tool-pi-durable": "file:../../../dsh-plugins/dsh-pi-durable/packages/tool-pi-durable"
```

## Compatibility

| Component | Supported contract |
| --- | --- |
| Node.js | `^22.19.0 \|\| >=24.0.0` (`engines.node`) |
| DeepSeek Harness | `0.2.0-rc.2` peer range (`@deepseek-ai/cordis ~4.0.4`, `@deepseek-ai/dsh-tools ^0.2.0-rc.2`) |
| Upstream runtime | `@earendil-works/pi-durable`, `@earendil-works/pi-ai`, `@earendil-works/chord` `^1.0.0` — regular npm dependencies, unmodified |
| Storage | pi-durable owns its SQLite medium — default `~/.dsh/storages/pi-agent.sqlite`, overridable via the row's `path` |

Upstream seam-contract changes require a new package release and contract
review.

## Development

```sh
pnpm install
pnpm --filter @hy-sde-org/dsh-pi-durable check && pnpm --filter @hy-sde-org/dsh-pi-durable test
pnpm build   # container-wide build/check/test via package scripts
```

Engine tests exercise the durable flow over real SQLite (write → close →
reopen → verify, requestId dedup, fork, status) with no model configured.

## License and attribution

This package is licensed MIT — see [LICENSE](LICENSE). The pi packages it
mounts are third-party npm dependencies used unmodified under their own MIT
license (project [pi](https://github.com/franekp/pi) by franekp); no source
from them is vendored into this repository. The upstream notices are
reproduced in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

This plugin is a separate installable package; the harness remains the
property of its own project.
