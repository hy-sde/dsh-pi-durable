/**
 * Cordis host-plane plugin publishing the `piDurableAgent` service: the
 * durable-agent engine over @earendil-works/pi-durable. The service is
 * provided synchronously (a facade whose first use awaits the eager open),
 * so agent presets resolve it at apply time without racing the SQLite init.
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { PiDurableAgent } from './agent.ts'
import { resolvePiDurableConfig, type PiDurablePluginConfig } from './config.ts'

/** Name of the published service (consumed by @hy-sde-org/dsh-tool-pi-durable). */
export const SERVICE_PI_DURABLE = 'piDurableAgent'

/** Cordis plugin name. */
export const name = 'pi-durable'

/** No host services injected: the engine owns its storage medium outright. */
export const inject: readonly string[] = []

/** Plugin configuration (see the row comments in cordis.patch.yml). */
export type Config = PiDurablePluginConfig

/** Plugin config schema; every field is optional with engine defaults. */
export const Config: z<Config> = z.object({
  path: z.string(),
  baseUrl: z.string(),
  apiKeyEnv: z.string().default('PI_DURABLE_API_KEY'),
  apiKey: z.string(),
  providerId: z.string().default('dsh-relay'),
  providerName: z.string(),
  modelId: z.string().default('default'),
  modelName: z.string(),
  api: z.union(['openai-completions', 'openai-responses'] as const),
  contextWindow: z.number().step(1).min(1),
  maxTokens: z.number().step(1).min(1),
  cwd: z.string(),
  instructions: z.string(),
  thinkingLevel: z.union([
    'off',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ] as const),
})

/**
 * Provide the engine facade and tie its teardown to the plugin fiber, so an
 * unload (HMR included) closes the harness and storage with it.
 * @param ctx - host-plane plugin context.
 * @param config - validated row configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolvePiDurableConfig(config)
  const agent = new PiDurableAgent(resolved)
  ctx.provide(SERVICE_PI_DURABLE, agent)
  ctx.effect(() => async () => {
    await agent.close()
  }, 'pi-durable.close()')
}

export default { name, inject, apply }
