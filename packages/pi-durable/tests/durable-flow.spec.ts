/**
 * Durable-flow tests for the engine facade over real SQLite storage — no
 * model required (passive writes exercise admission, checkpointing, close,
 * reopen, fork, and exactly-once request ids).
 * @module
 */

import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { ROOT_CONVERSATION_ID } from '@earendil-works/pi-durable'
import { PiDurableAgent } from '../src/agent.ts'
import { resolvePiDurableConfig } from '../src/config.ts'

const dir = mkdtempSync(path.join(os.tmpdir(), 'pi-durable-engine-'))

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

function configFor(file: string) {
  return resolvePiDurableConfig({ path: path.join(dir, file), cwd: dir })
}

/** Poll until `predicate` sees the entry page, with a small deadline. */
async function until(agent: PiDurableAgent, predicate: (items: readonly { kind: string }[]) => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  for (;;) {
    const page = await agent.history(50)
    if (predicate(page.items)) return
    if (Date.now() > deadline) throw new Error('deadline exceeded waiting for entries')
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

it('persists a passive write across close and reopen', async () => {
  const first = new PiDurableAgent(configFor('persist.sqlite'))
  await first.writeEntry('note', { text: 'hello' }, 'req-1')
  await first.close()

  const second = new PiDurableAgent(configFor('persist.sqlite'))
  await until(second, items => items.some(entry => entry.kind === 'note'))
  const page = await second.history(50)
  const note = page.items.find(entry => entry.kind === 'note')
  if (note === undefined) throw new Error('note entry missing after reopen')
  expect(note.data).toEqual({ text: 'hello' })
  await second.close()
})

it('deduplicates submissions by requestId', async () => {
  const agent = new PiDurableAgent(configFor('dedup.sqlite'))
  const one = await agent.writeEntry('note', { n: 1 }, 'same-req')
  const two = await agent.writeEntry('note', { n: 2 }, 'same-req')
  expect(two.submissionId).toBe(one.submissionId)
  await until(agent, items => items.filter(entry => entry.kind === 'note').length === 1)
  const page = await agent.history(50)
  expect(page.items.filter(entry => entry.kind === 'note')).toHaveLength(1)
  await agent.close()
})

it('forks the root conversation at an entry', async () => {
  const agent = new PiDurableAgent(configFor('fork.sqlite'))
  await agent.writeEntry('note', { n: 42 })
  await until(agent, items => items.some(entry => entry.kind === 'note'))
  const page = await agent.history(50)
  const note = page.items.find(entry => entry.kind === 'note')
  if (note === undefined) throw new Error('note entry missing before fork')

  const forked = await agent.forkFrom(String(note.id))
  expect(forked.conversationId).not.toBe(ROOT_CONVERSATION_ID)

  const forkedPage = await agent.historyOf(forked.conversationId, 50)
  expect(forkedPage.items.some(entry => entry.kind === 'note' && entry.data != null)).toBe(true)
  await agent.close()
})

it('reports status with inspection', async () => {
  const agent = new PiDurableAgent(configFor('status.sqlite'))
  await agent.writeEntry('note', { n: 1 })
  const status = await agent.status()
  expect(status.rootConversationId).toBe(String(ROOT_CONVERSATION_ID))
  expect(status.generationConfigured).toBe(false)
  expect(status.inspection.scheduling).toBe('running')
  await agent.close()
})

it('rejects input submissions without a configured model', async () => {
  const agent = new PiDurableAgent(configFor('nomodel.sqlite'))
  await expect(agent.submitInput('hello')).rejects.toThrow('pi-durable-not-configured')
  await agent.close()
})
