/**
 * Configuration resolution for the pi-durable engine plugin.
 * @module
 */

import os from 'node:os'
import path from 'node:path'

/** Thinking levels accepted on the row (`AgentChange.thinkingLevel`). */
export type PiDurableThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Raw plugin configuration as accepted from the cordis row. */
export interface PiDurablePluginConfig {
  /** SQLite database path (default: `<DSH_HOME|~/.dsh>/storages/pi-agent.sqlite`). */
  path?: string
  /** OpenAI-compatible endpoint base URL; unset = write-only mode (no generation). */
  baseUrl?: string
  /** Environment variable carrying the relay API key (default `PI_DURABLE_API_KEY`). */
  apiKeyEnv?: string
  /** Inline API key (development only; prefer `apiKeyEnv`). */
  apiKey?: string
  /** Provider id registered into the pi-ai model registry (default `dsh-relay`). */
  providerId?: string
  /** Provider display name (default `DSH Relay`). */
  providerName?: string
  /** Model id sent to the relay (default `default`). */
  modelId?: string
  /** Model display name (default: the model id). */
  modelName?: string
  /** Wire API: `openai-completions` (default) or `openai-responses`. */
  api?: 'openai-completions' | 'openai-responses'
  /** Advertised context window (default 200000). */
  contextWindow?: number
  /** Advertised max output tokens (default 8192). */
  maxTokens?: number
  /** Working directory for the durable agent's coding tools (default: process cwd). */
  cwd?: string
  /** Instructions applied when the root conversation is first created. */
  instructions?: string
  /** Thinking level for the root agent (default unset → provider default). */
  thinkingLevel?: PiDurableThinkingLevel
}

/** Fully resolved engine configuration. */
export interface ResolvedPiDurableConfig {
  readonly path: string
  readonly baseUrl: string | undefined
  readonly apiKeyEnv: string
  readonly apiKey: string | undefined
  readonly providerId: string
  readonly providerName: string
  readonly modelId: string
  readonly modelName: string
  readonly api: 'openai-completions' | 'openai-responses'
  readonly contextWindow: number
  readonly maxTokens: number
  readonly cwd: string
  readonly instructions: string | undefined
  readonly thinkingLevel: PiDurableThinkingLevel | undefined
}

/** Default database path under the DSH home (env `DSH_HOME`, else `~/.dsh`). */
export function defaultPiDurableDbPath(): string {
  const dshHome = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(dshHome, 'storages', 'pi-agent.sqlite')
}

/** Trim a configured URL; empty/whitespace counts as unset. */
function normalizeBaseUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

/** Resolve row defaults into the immutable runtime config. */
export function resolvePiDurableConfig(config: PiDurablePluginConfig): ResolvedPiDurableConfig {
  const api = config.api === 'openai-responses' ? 'openai-responses' : 'openai-completions'
  const modelId = config.modelId ?? 'default'
  return {
    path: config.path ?? defaultPiDurableDbPath(),
    baseUrl: normalizeBaseUrl(config.baseUrl),
    apiKeyEnv: config.apiKeyEnv ?? 'PI_DURABLE_API_KEY',
    apiKey: config.apiKey,
    providerId: config.providerId ?? 'dsh-relay',
    providerName: config.providerName ?? 'DSH Relay',
    modelId,
    modelName: config.modelName ?? modelId,
    api,
    contextWindow: config.contextWindow ?? 200_000,
    maxTokens: config.maxTokens ?? 8_192,
    cwd: config.cwd ?? process.cwd(),
    instructions: config.instructions,
    thinkingLevel: config.thinkingLevel,
  }
}
