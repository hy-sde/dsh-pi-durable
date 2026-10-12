# @hy-sde-org/dsh-pi-durable

The **engine** half of the dsh-pi-durable plugin for DeepSeek Harness: a
HOST-plane row (`hy-sde-pi-durable`) that publishes the `piDurableAgent`
service — a separate durable agent conversation with its own transcript, its
own coding toolset, and its own durable SQLite storage
(`~/.dsh/storages/pi-agent.sqlite`, overridable via `path`), over an
OpenAI-compatible relay provider (`baseUrl`, `apiKeyEnv`, `modelId`).
Submissions are exactly-once per `requestId`, the process can crash and
resume, and conversations fork at any entry. It **injects nothing** from the
host.

The model-facing tools (`durable_agent_submit`, `durable_agent_write`,
`durable_agent_status`, `durable_agent_history`, `durable_agent_fork`,
`durable_agent_abort`) live in the companion package
[`@hy-sde-org/dsh-tool-pi-durable`](https://www.npmjs.com/package/@hy-sde-org/dsh-tool-pi-durable).

```bash
dsh plugin --profile web add @hy-sde-org/dsh-pi-durable @hy-sde-org/dsh-tool-pi-durable
```

Without `baseUrl` the engine installs and runs in **write-only mode** (passive
writes, documents, and tasks; `durable_agent_submit` fails loud). Full usage,
configuration, mounting, and the relationship to the harness's own
orchestration plane: https://github.com/hy-sde/dsh-pi-durable#readme

MIT License. Based on [pi](https://github.com/franekp/pi) by franekp, mounted
as unmodified npm dependencies; see THIRD-PARTY-NOTICES.md in the repo.
