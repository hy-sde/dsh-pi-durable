/**
 * Model-facing durable-agent tools over the host-provided `piDurableAgent`
 * service (@hy-sde-org/dsh-pi-durable engine row): durable_agent_submit,
 * durable_agent_write, durable_agent_status, durable_agent_history,
 * durable_agent_fork, durable_agent_abort, and the `durable-agent` prompt
 * section. The package contributes no durable state of its own — the
 * composition constructs one engine and provides it under
 * {@link SERVICE_PI_DURABLE}; this plugin consumes it.
 *
 * Agent-plane: this package mounts as a preset row and resolves the host
 * service with `ctx.get` (optional service: without the engine the tools
 * still mount, so a session never fails to create just because the engine is
 * absent — and every call fails loud with `[pi-durable-unavailable]` until
 * the host provides it).
 * @module @hy-sde-org/dsh-tool-pi-durable
 */

import type { Context } from '@deepseek-ai/cordis'
import {
  ToolArgsError,
  parameterSchemaSpecToJsonSchema,
  validateArgs,
  valueSchemaSpecToJsonSchema,
} from '@deepseek-ai/dsh-tools'
import { SERVICE_PI_DURABLE, type PiDurableAgent } from '@hy-sde-org/dsh-pi-durable'
import { buildPiDurablePromptSection, type PiDurablePromptConfig } from './prompt.ts'
import { piDurableToolDefinitions, type AnyPiDurableToolDefinition } from './tools.ts'

export { PI_DURABLE_PROMPT, PI_DURABLE_PROMPT_SECTION_NAME, buildPiDurablePromptSection } from './prompt.ts'
export type { PiDurablePromptConfig } from './prompt.ts'
export {
  MAX_RENDER_CHARS,
  cappedJson,
  piDurableToolDefinitions,
  type AnyPiDurableToolDefinition,
  type ForkToolArgs,
  type HistoryToolArgs,
  type PiDurableToolDefinition,
  type SubmitToolArgs,
  type WriteToolArgs,
} from './tools.ts'

/** Plugin configuration. */
export interface Config extends PiDurablePromptConfig {
  /** Disable the tool registrations and prompt section entirely (default false). */
  enabled?: boolean
}

/** Cordis plugin name for loader diagnostics. */
export const name = 'tool-pi-durable'

/** Services consumed by this plugin (the engine facade is resolved opportunistically with `ctx.get`). */
export const inject = ['tools', 'systemPrompt']

/**
 * Register the six durable-agent tools and the `durable-agent` prompt
 * section over the host-provided engine facade. Without the engine the tools
 * still register but every call fails loud with `[pi-durable-unavailable]` —
 * mounting a preset must never break session creation over an optional host.
 * @param ctx - the agent-plane plugin context (injects `tools`, `systemPrompt`).
 * @param config - resolved plugin configuration.
 */
export function apply(ctx: Context, config: Config = {}): void {
  if (config.enabled === false) return
  const agent = ctx.get(SERVICE_PI_DURABLE) as PiDurableAgent | undefined
  const unavailable = agent === undefined
    ? 'the piDurableAgent service is not provided — mount the @hy-sde-org/dsh-pi-durable engine row (host plane) to publish it'
    : undefined
  for (const def of piDurableToolDefinitions() as readonly AnyPiDurableToolDefinition[]) {
    const parameters = parameterSchemaSpecToJsonSchema(def.parameters)
    const outputSchema = valueSchemaSpecToJsonSchema(def.outputSchema)
    ctx.tools.register({
      name: def.name,
      description: def.description,
      parameters: parameters as unknown as Record<string, unknown>,
      output: {
        schema: outputSchema,
        render: (args, value) => [{ type: 'text', text: def.render(args as never, value as never) }],
      },
      execute: async (args, _exec) => {
        if (agent === undefined) {
          throw new Error(`[pi-durable-unavailable] ${unavailable ?? 'the piDurableAgent service is not provided'}`)
        }
        const violations = validateArgs(def.parameters, args)
        if (violations.length > 0) throw new ToolArgsError(violations)
        return await def.execute(args as never, agent)
      },
    })
  }
  ctx.systemPrompt.section(buildPiDurablePromptSection(config))
}

export default { name, inject, apply }
