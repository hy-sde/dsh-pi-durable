/**
 * The durable-agent runtime: one pi-durable {@link Harness} over SQLite
 * storage with the relay provider registered, plus the narrow facade the
 * model-facing tools consume. The harness opens eagerly on construction
 * (failures surface to every caller) and the root conversation is created
 * idempotently on first use, so a host restart resumes in place.
 * @module
 */

import { type JsonValue } from '@earendil-works/chord'
import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context'
import { createModels } from '@earendil-works/pi-ai'
import {
  createRegistry,
  Harness,
  ROOT_CONVERSATION_ID,
  type Conversation,
  type ConversationId,
  type Cursor,
  type EntryId,
  type EntryRecord,
  type HarnessInspection,
  type Page,
  type Registry,
  type SubmissionDraft,
  type SubmissionId,
  type SubmissionRecord,
  type ToolRegistration,
} from '@earendil-works/pi-durable'
import { CodingTools } from '@earendil-works/pi-durable/tools'
import { openNodeSqliteStorage } from '@earendil-works/pi-durable/storage/sqlite/node'
import { NodeExecutionEnv } from '@earendil-works/pi-durable/env/node'
import type { ResolvedPiDurableConfig } from './config.ts'
import { createRelayProvider } from './provider.ts'

/** Result of admitting one root submission. */
export interface RootSubmissionOutcome {
  readonly submissionId: string
  readonly record: SubmissionRecord
}

/** Point-in-time status of the engine. */
export interface PiDurableStatus {
  readonly rootConversationId: string
  readonly inspection: HarnessInspection
  readonly generationConfigured: boolean
}

const BUSY_TIMEOUT_MS = 5_000

/**
 * The engine facade published under the `piDurableAgent` service key.
 * Every method awaits the eager open, so a failed init rejects loudly at
 * call time with the original error.
 */
export class PiDurableAgent {
  private readonly openPromise: Promise<void>
  private harness: Harness | undefined
  private rootPromise: Promise<Conversation> | undefined

  constructor(private readonly config: ResolvedPiDurableConfig) {
    this.openPromise = this.open()
  }

  private async open(): Promise<void> {
    const storage = await openNodeSqliteStorage(this.config.path, { busyTimeoutMs: BUSY_TIMEOUT_MS })
    const models = createModels()
    if (this.config.baseUrl !== undefined) {
      models.setProvider(createRelayProvider(this.config))
    }
    const harness = await Harness.open(storage, {
      models,
      registry: createEngineRegistry(),
      env: (target) => new NodeExecutionEnv({ cwd: target.cwd ?? this.config.cwd }),
    }, BACKGROUND_CONTEXT)
    this.harness = harness
    await harness.resume()
  }

  /** Resolves once the harness is open; rejections carry the init error. */
  async ready(): Promise<void> {
    await this.openPromise
  }

  private async harnessOf(): Promise<Harness> {
    await this.openPromise
    const harness = this.harness
    if (harness === undefined) throw new Error('[pi-durable] harness failed to open')
    return harness
  }

  private async root(): Promise<Conversation> {
    const harness = await this.harnessOf()
    this.rootPromise ??= this.openRoot(harness)
    return await this.rootPromise
  }

  private async openRoot(harness: Harness): Promise<Conversation> {
    const existing = await this.findExistingRoot(harness)
    if (existing !== undefined) return existing
    const agent = {
      extensions: [CodingTools],
      ...(this.config.baseUrl !== undefined
        ? { model: { provider: this.config.providerId, modelId: this.config.modelId } }
        : {}),
      ...(this.config.thinkingLevel !== undefined ? { thinkingLevel: this.config.thinkingLevel } : {}),
      ...(this.config.instructions !== undefined ? { instructions: this.config.instructions } : {}),
    }
    return await harness.root(BACKGROUND_CONTEXT, { agent })
  }

  private async findExistingRoot(harness: Harness): Promise<Conversation | undefined> {
    try {
      return await harness.conversation(ROOT_CONVERSATION_ID, BACKGROUND_CONTEXT) ?? undefined
    } catch {
      return undefined
    }
  }

  private assertGenerationConfigured(): void {
    if (this.config.baseUrl === undefined) {
      throw new Error(
        '[pi-durable-not-configured] no baseUrl configured — generation is unavailable. '
        + 'Set config.baseUrl (and apiKeyEnv) on the hy-sde-pi-durable row; passive writes and tasks still work.',
      )
    }
  }

  /**
   * Submit user input to the root conversation. Exactly-once per `requestId`
   * (scoped to the conversation); the run continues in the background.
   */
  async submitInput(
    input: string,
    options: { requestId?: string; whenBusy?: 'steer' | 'followUp' | 'reject' } = {},
  ): Promise<RootSubmissionOutcome> {
    this.assertGenerationConfigured()
    const root = await this.root()
    const draft: SubmissionDraft = {
      type: 'input',
      content: input,
      ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
      ...(options.whenBusy !== undefined ? { whenBusy: options.whenBusy } : {}),
    }
    const submission = await root.submit(draft, BACKGROUND_CONTEXT)
    const record = await submission.status(BACKGROUND_CONTEXT)
    return { submissionId: String(submission.id), record }
  }

  /**
   * Admit a passive entry write to the root conversation — durable
   * bookkeeping that never triggers a generation run.
   */
  async writeEntry(kind: string, data: JsonValue, requestId?: string): Promise<RootSubmissionOutcome> {
    const root = await this.root()
    const draft: SubmissionDraft = {
      type: 'write',
      entry: { kind, data },
      ...(requestId !== undefined ? { requestId } : {}),
    }
    const submission = await root.submit(draft, BACKGROUND_CONTEXT)
    const record = await submission.status(BACKGROUND_CONTEXT)
    return { submissionId: String(submission.id), record }
  }

  /** Resolve one submission record by id (undefined when unknown). */
  async submissionRecord(id: string): Promise<SubmissionRecord | undefined> {
    const harness = await this.harnessOf()
    const submission = await harness.submission(Number(id) as SubmissionId, BACKGROUND_CONTEXT)
    if (submission === undefined) return undefined
    return await submission.status(BACKGROUND_CONTEXT)
  }

  /** Newest-first fork-aware page of the root conversation's history. */
  async history(limit: number, cursor?: Cursor): Promise<Page<EntryRecord, Cursor>> {
    const root = await this.root()
    return await root.entries({}, limit, cursor, BACKGROUND_CONTEXT)
  }

  /** Newest-first page of any conversation's history (used for forks). */
  async historyOf(
    conversationId: string,
    limit: number,
    cursor?: Cursor,
  ): Promise<Page<EntryRecord, Cursor>> {
    const harness = await this.harnessOf()
    const conversation = await harness.conversation(Number(conversationId) as ConversationId, BACKGROUND_CONTEXT)
    if (conversation === undefined) {
      throw new Error(`[pi-durable-unknown-conversation] no conversation ${conversationId}`)
    }
    return await conversation.entries({}, limit, cursor, BACKGROUND_CONTEXT)
  }

  /** Fork the root conversation at an entry; history up to `entryId` is inherited. */
  async forkFrom(entryId: string, options: { instructions?: string } = {}): Promise<{ conversationId: string }> {
    const root = await this.root()
    const conversation = await root.fork(Number(entryId) as EntryId, {
      ownership: { kind: 'ownerless' },
      ...(options.instructions !== undefined ? { agent: { instructions: options.instructions } } : {}),
    }, BACKGROUND_CONTEXT)
    return { conversationId: String(conversation.id) }
  }

  /** Abort the root conversation's ordinary scope and resolve when idle. */
  async abortRoot(): Promise<void> {
    const root = await this.root()
    await root.abort(BACKGROUND_CONTEXT)
  }

  /** Point-in-time status of the engine. */
  async status(): Promise<PiDurableStatus> {
    const harness = await this.harnessOf()
    const root = await this.root()
    const inspection = await harness.inspect(BACKGROUND_CONTEXT)
    return {
      rootConversationId: String(root.id),
      inspection,
      generationConfigured: this.config.baseUrl !== undefined,
    }
  }

  /** Seal admission, settle commits, close storage. Idempotent. */
  async close(): Promise<void> {
    try {
      await this.openPromise
    } catch {
      return // init failed: nothing to close
    }
    const harness = this.harness
    this.harness = undefined
    this.rootPromise = undefined
    if (harness !== undefined) {
      await harness.close(BACKGROUND_CONTEXT)
    }
  }
}

/** The engine's registry: the CodingTools toolset installed by default. */
function createEngineRegistry(): Registry<ToolRegistration> {
  const registry = createRegistry<ToolRegistration>()
  registry.install(CodingTools)
  return registry
}
