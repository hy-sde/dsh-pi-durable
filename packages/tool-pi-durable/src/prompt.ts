/**
 * The `durable-agent` system-prompt section: what the durable agent is, the
 * submit-and-poll contract, and the fork model. Mirrors the tool-graph
 * section pattern.
 * @module @hy-sde-org/dsh-tool-pi-durable/prompt
 */

import type { PromptSection } from '@deepseek-ai/dsh-system-prompt'

/** Plugin configuration contributed by the prompt section. */
export interface PiDurablePromptConfig {
  /** Disable the prompt section entirely (default false). */
  enabled?: boolean
}

export const PI_DURABLE_PROMPT_SECTION_NAME = 'durable-agent'
const SECTION_ORDER = 128

/**
 * The `durable-agent` section text: how to drive the durable agent from the
 * host session.
 */
export const PI_DURABLE_PROMPT: string = [
  'Durable agent: the host also runs a pi-durable agent conversation — its own transcript, its own coding tools (bash/read/write/edit), its own durable SQLite storage that survives host restarts. Drive it with durable_agent_submit (input, exactly-once per requestId), durable_agent_write (passive bookkeeping that never triggers a run), durable_agent_status, durable_agent_history, durable_agent_fork, and durable_agent_abort.',
  'Submit, don\'t wait: durable_agent_submit returns after admission (submission id + status); the run continues in the background of the host process. Poll durable_agent_status, then read its transcript with durable_agent_history (page via nextCursor). Reuse a requestId to retry a submit safely — it deduplicates.',
  'Fork, don\'t rerun: durable_agent_fork branches the conversation at any entry id from history — the fork inherits the transcript up to that entry, so you can retry a divergent branch without replaying it.',
].join('\n')

/**
 * Build the `durable-agent` prompt section.
 * @param config - section configuration.
 * @returns the {@link PromptSection} to register.
 */
export function buildPiDurablePromptSection(config: PiDurablePromptConfig = {}): PromptSection {
  return {
    name: PI_DURABLE_PROMPT_SECTION_NAME,
    order: SECTION_ORDER,
    text: config.enabled === false ? '' : PI_DURABLE_PROMPT,
  }
}
