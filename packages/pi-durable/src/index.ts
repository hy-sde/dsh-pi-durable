/**
 * @hy-sde-org/dsh-pi-durable — the durable-agent engine plugin for DeepSeek
 * Harness. Publishes the `piDurableAgent` service: a pi-durable Harness over
 * a SQLite storage backend with an OpenAI-compatible relay provider, plus a
 * narrow facade (submit / write / history / fork / abort / status) that the
 * model-facing tools in @hy-sde-org/dsh-tool-pi-durable consume.
 * @module @hy-sde-org/dsh-pi-durable
 */

export { SERVICE_PI_DURABLE, default as plugin } from './plugin.ts'
export type { Config } from './plugin.ts'
export {
  defaultPiDurableDbPath,
  resolvePiDurableConfig,
  type PiDurablePluginConfig,
  type PiDurableThinkingLevel,
  type ResolvedPiDurableConfig,
} from './config.ts'
export { createRelayProvider } from './provider.ts'
export { PiDurableAgent, type PiDurableStatus, type RootSubmissionOutcome } from './agent.ts'
export type { JsonValue } from '@earendil-works/chord'
