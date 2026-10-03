/**
 * Host-agnostic durable-agent tool definitions over one
 * {@link PiDurableAgent} service — the Cordis adapter in `index.ts` wires the
 * live service; these definitions stay plain so tests can run without a host.
 * @module @hy-sde-org/dsh-tool-pi-durable/tools
 */

import type { Cursor } from '@earendil-works/pi-durable'
import type { JsonValue } from '@hy-sde-org/dsh-pi-durable'
import type { ParameterSchemaSpec, ValueSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { PiDurableAgent, RootSubmissionOutcome } from '@hy-sde-org/dsh-pi-durable'

/** One host-agnostic tool definition. */
export interface PiDurableToolDefinition<A, V> {
  readonly name: string
  readonly description: string
  readonly parameters: ParameterSchemaSpec
  readonly outputSchema: ValueSchemaSpec
  execute(args: A, agent: PiDurableAgent): Promise<V>
  render(args: A, value: V): string
}

/** Max chars of JSON in one render; anything longer is truncated with a note. */
export const MAX_RENDER_CHARS = 12_000

/** Compact lossless-ish JSON with a hard cap. */
export function cappedJson(value: unknown): string {
  const text = JSON.stringify(value, (_key, item: unknown) => item, 2) ?? 'null'
  if (text.length <= MAX_RENDER_CHARS) return text
  return `${text.slice(0, MAX_RENDER_CHARS)}\n… (truncated, ${text.length - MAX_RENDER_CHARS} more chars)`
}

/** Short single-line projection of an entry for history listings. */
function entryLine(entry: { readonly id: string; readonly kind: string; readonly data?: JsonValue }): string {
  const data = entry.data === undefined ? '·' : JSON.stringify(entry.data)
  const clipped = data.length > 240 ? `${data.slice(0, 240)}…` : data
  return `- ${entry.id} kind=${entry.kind} data=${clipped}`
}

/** One history item projected for {@link entryLine}. */
function entryView(entry: { readonly id: unknown; readonly kind: string; readonly data?: JsonValue }): { readonly id: string; readonly kind: string; readonly data?: JsonValue } {
  return entry.data === undefined
    ? { id: String(entry.id), kind: entry.kind }
    : { id: String(entry.id), kind: entry.kind, data: entry.data }
}

/** Args of `durable_agent_submit`. */
export interface SubmitToolArgs {
  readonly input: string
  readonly requestId?: string
  readonly whenBusy?: 'steer' | 'followUp' | 'reject'
}

/** Args of `durable_agent_write`. */
export interface WriteToolArgs {
  readonly kind: string
  readonly data: JsonValue
  readonly requestId?: string
}

/** Args of `durable_agent_history`. */
export interface HistoryToolArgs {
  readonly limit?: number
  readonly cursor?: string
}

/** Args of `durable_agent_fork`. */
export interface ForkToolArgs {
  readonly entryId: string
  readonly instructions?: string
}

const WHEN_BUSY_VALUES = new Set(['steer', 'followUp', 'reject'])

/**
 * Build the six durable-agent tool definitions over one service facade.
 * @returns the definitions in registration order.
 */
export function piDurableToolDefinitions(): readonly AnyPiDurableToolDefinition[] {
  const submit: PiDurableToolDefinition<SubmitToolArgs, RootSubmissionOutcome> = {
    name: 'durable_agent_submit',
    description:
      'Submit user input to the durable agent (its own pi-durable conversation with its own transcript, coding tools, '
      + 'and model route). Exactly-once per requestId; the run continues in the background — poll durable_agent_status '
      + 'or durable_agent_history for progress. whenBusy: steer (default behavior of queued steering), followUp '
      + '(queue after the current run), reject (fail with ConversationBusy instead of queueing).',
    parameters: {
      input: { type: 'string', required: true, description: 'The user input for the durable agent.' },
      requestId: { type: 'string', description: 'Deduplication key scoped to the conversation; reuse to retry safely.' },
      whenBusy: { type: 'string', description: 'steer | followUp | reject (default followUp semantics).' },
    },
    outputSchema: { type: 'json' },
    async execute(args, agent) {
      if (args.whenBusy !== undefined && !WHEN_BUSY_VALUES.has(args.whenBusy)) {
        throw new Error(`[pi-durable-invalid-when-busy] whenBusy must be one of steer | followUp | reject (got ${args.whenBusy})`)
      }
      return await agent.submitInput(args.input, {
        ...(args.requestId !== undefined ? { requestId: args.requestId } : {}),
        ...(args.whenBusy !== undefined ? { whenBusy: args.whenBusy } : {}),
      })
    },
    render: (_args, value) =>
      `Submitted to the durable agent: submission ${value.submissionId} (${String(value.record.status)}). `
      + 'The run continues in the background — check durable_agent_status, then durable_agent_history for its transcript.',
  }

  const write: PiDurableToolDefinition<WriteToolArgs, RootSubmissionOutcome> = {
    name: 'durable_agent_write',
    description:
      'Admit a passive entry write into the durable agent conversation — durable bookkeeping (notes, artifacts, '
      + 'control state) that never triggers a generation run. Exactly-once per requestId.',
    parameters: {
      kind: { type: 'string', required: true, description: 'Application-defined entry kind (e.g. "note", "artifact").' },
      data: { type: 'json', required: true, description: 'Lossless JSON payload stored with the entry.' },
      requestId: { type: 'string', description: 'Deduplication key scoped to the conversation; reuse to retry safely.' },
    },
    outputSchema: { type: 'json' },
    async execute(args, agent) {
      return await agent.writeEntry(args.kind, args.data, args.requestId)
    },
    render: (_args, value) =>
      `Durable write admitted: submission ${value.submissionId} (${String(value.record.status)}).\n${cappedJson(value.record)}`,
  }

  const status: PiDurableToolDefinition<Record<string, never>, Awaited<ReturnType<PiDurableAgent['status']>>> = {
    name: 'durable_agent_status',
    description:
      'Point-in-time status of the durable agent engine: root conversation id, scheduling state, queued/placed '
      + 'submissions, and whether generation is configured. Read-only.',
    parameters: {},
    outputSchema: { type: 'json' },
    async execute(_args, agent) {
      return await agent.status()
    },
    render: (_args, value) =>
      `Durable agent root ${value.rootConversationId}; scheduling ${value.inspection.scheduling}; `
      + `generation ${value.generationConfigured ? 'configured' : 'NOT configured (write-only)'}; `
      + `live submissions: ${value.inspection.submissions.length}.\n${cappedJson(value.inspection)}`,
  }

  const history: PiDurableToolDefinition<HistoryToolArgs, Awaited<ReturnType<PiDurableAgent['history']>>> = {
    name: 'durable_agent_history',
    description:
      'Read the durable agent conversation history (newest-first fork-aware scan). Pass the nextCursor from an '
      + 'earlier call to page. Entry ids are the fork points accepted by durable_agent_fork. Read-only.',
    parameters: {
      limit: { type: 'number', description: 'Page size (default 20, max 200).' },
      cursor: { type: 'string', description: 'Opaque nextCursor JSON from a previous page.' },
    },
    outputSchema: { type: 'json' },
    async execute(args, agent) {
      const limit = Math.min(Math.max(args.limit ?? 20, 1), 200)
      let cursor: Cursor | undefined
      if (args.cursor !== undefined) {
        try {
          const parsed: unknown = JSON.parse(args.cursor)
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            cursor = parsed as Cursor
          }
        } catch {
          throw new Error('[pi-durable-invalid-cursor] cursor must be the JSON object returned as nextCursor')
        }
      }
      return await agent.history(limit, cursor)
    },
    render: (_args, value) => {
      const lines = value.items.map(entry => entryLine(entryView(entry)))
      const next = value.next === undefined ? '' : `\nnextCursor: ${JSON.stringify(value.next)}`
      return `Durable agent history (${value.items.length} entries, newest first):${next}\n${lines.join('\n') || '(empty)'}`
    },
  }

  const fork: PiDurableToolDefinition<ForkToolArgs, { conversationId: string }> = {
    name: 'durable_agent_fork',
    description:
      'Fork the durable agent conversation at an entry id (from durable_agent_history): the new conversation inherits '
      + 'history up to that entry and diverges from there. Optionally set instructions for the fork.',
    parameters: {
      entryId: { type: 'string', required: true, description: 'Entry id to fork at (inclusive parent).' },
      instructions: { type: 'string', description: 'Agent instructions for the fork.' },
    },
    outputSchema: { type: 'json' },
    async execute(args, agent) {
      return await agent.forkFrom(args.entryId, {
        ...(args.instructions !== undefined ? { instructions: args.instructions } : {}),
      })
    },
    render: (_args, value) =>
      `Forked: new conversation ${value.conversationId}. Its history is readable via durable_agent_status on request; `
      + 'submit to the ROOT conversation stays on the root — fork submissions follow in a later revision.',
  }

  const abort: PiDurableToolDefinition<Record<string, never>, { ok: true }> = {
    name: 'durable_agent_abort',
    description:
      'Abort the durable agent conversation scope: withdraw queued inputs, mark live tasks, and resolve when idle. '
      + 'Committed history stays durable.',
    parameters: {},
    outputSchema: { type: 'json' },
    async execute(_args, agent) {
      await agent.abortRoot()
      return { ok: true }
    },
    render: (_args, value) => (value.ok ? 'Aborted the durable agent scope; committed history stays durable.' : 'not ok'),
  }

  return [submit, write, status, history, fork, abort]
}

/** Union of every tool definition (what the Cordis adapter iterates). */
export type AnyPiDurableToolDefinition =
  | PiDurableToolDefinition<SubmitToolArgs, RootSubmissionOutcome>
  | PiDurableToolDefinition<WriteToolArgs, RootSubmissionOutcome>
  | PiDurableToolDefinition<Record<string, never>, Awaited<ReturnType<PiDurableAgent['status']>>>
  | PiDurableToolDefinition<HistoryToolArgs, Awaited<ReturnType<PiDurableAgent['history']>>>
  | PiDurableToolDefinition<ForkToolArgs, { conversationId: string }>
  | PiDurableToolDefinition<Record<string, never>, { ok: true }>
