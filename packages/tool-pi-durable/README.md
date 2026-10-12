# @hy-sde-org/dsh-tool-pi-durable

The **tools** half of the dsh-pi-durable plugin for DeepSeek Harness: a preset
row (`hy-sde-tool-pi-durable`) exposing the durable agent to the model —
`durable_agent_submit`, `durable_agent_write`, `durable_agent_status`,
`durable_agent_history`, `durable_agent_fork`, `durable_agent_abort` — plus
the `durable-agent` prompt section. It resolves the engine service published
by [`@hy-sde-org/dsh-pi-durable`](https://www.npmjs.com/package/@hy-sde-org/dsh-pi-durable)
by name; without the engine the tools still mount and every call fails loud
with `[pi-durable-unavailable]` — mounting a preset must never break session
creation over an optional host.

```bash
dsh plugin --profile web add @hy-sde-org/dsh-pi-durable @hy-sde-org/dsh-tool-pi-durable
```

Disable per deployment by patching the row by id
(`hy-sde-tool-pi-durable` → `config.enabled: false`). Full usage and
configuration: https://github.com/hy-sde/dsh-pi-durable#readme

MIT License. Based on [pi](https://github.com/franekp/pi) by franekp, mounted
as unmodified npm dependencies; see THIRD-PARTY-NOTICES.md in the repo.
