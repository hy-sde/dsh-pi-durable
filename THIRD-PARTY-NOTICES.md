# Third-Party Notices

This project depends on the following third-party packages, unmodified, under
their own license terms. No source from them is vendored into this repository;
they are resolved as regular npm dependencies.

## @earendil-works/pi-durable

- **Project**: https://github.com/franekp/pi (package `@earendil-works/pi-durable`)
- **License**: MIT
- **Role**: the durable agent harness this plugin mounts (conversations,
  exactly-once submissions, fork-at-entry, tasks, documents over a SQLite
  storage backend).

## @earendil-works/pi-ai

- **Project**: https://github.com/franekp/pi (package `@earendil-works/pi-ai`)
- **License**: MIT
- **Role**: the model layer (`createProvider`, `createModels`, OpenAI-compatible
  API handlers) used to route the durable agent's generation requests.

## @earendil-works/chord

- **Project**: https://github.com/franekp/pi (package `@earendil-works/chord`)
- **License**: MIT
- **Role**: structured concurrency contexts (`BACKGROUND_CONTEXT`) used to
  drive the harness.

## DeepSeek Harness

- **Project**: https://github.com/hy-sde/deepseek-harness (packages
  `@deepseek-ai/cordis`, `@deepseek-ai/dsh-tools`)
- **License**: MIT
- **Role**: the plugin host this package mounts into (cordis plugin contract,
  model-facing tool registration).
