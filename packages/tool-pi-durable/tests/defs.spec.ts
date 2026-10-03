/**
 * Unit tests for the host-agnostic tool definitions: shape, render output,
 * and argument validation against the projected JSON schema. No host or
 * harness required.
 * @module
 */

import { describe, expect, it } from 'vitest'
import {
  parameterSchemaSpecToJsonSchema,
  validateArgs,
  ToolArgsError,
} from '@deepseek-ai/dsh-tools'
import { piDurableToolDefinitions } from '../src/tools.ts'

const defs = piDurableToolDefinitions()

describe('piDurableToolDefinitions', () => {
  it('registers the six durable_agent tools with unique names', () => {
    const names = defs.map(def => def.name)
    expect(names).toEqual([
      'durable_agent_submit',
      'durable_agent_write',
      'durable_agent_status',
      'durable_agent_history',
      'durable_agent_fork',
      'durable_agent_abort',
    ])
    expect(new Set(names).size).toBe(names.length)
  })

  it('marks required parameters in the projected JSON schema', () => {
    for (const def of defs) {
      const schema = parameterSchemaSpecToJsonSchema(def.parameters) as {
        properties: Record<string, { type?: string }>
        required?: string[]
      }
      expect(schema.properties, def.name).toBeTruthy()
      for (const [key, spec] of Object.entries(def.parameters)) {
        if ('required' in spec && spec.required) {
          expect(schema.required, `${def.name}.${key}`).toContain(key)
        }
      }
    }
  })

  it('validates good and bad submit args', () => {
    const submit = defs[0]
    if (submit === undefined) throw new Error('missing submit definition')
    expect(validateArgs(submit.parameters, { input: 'hello' })).toEqual([])
    expect(validateArgs(submit.parameters, { input: 'hello', requestId: 'r1', whenBusy: 'reject' })).toEqual([])
    const bad = validateArgs(submit.parameters, {})
    expect(bad.length).toBeGreaterThan(0)
    expect(() => { throw new ToolArgsError(bad) }).toThrow(ToolArgsError)
  })

  it('renders every tool to non-empty text', () => {
    const fakeValues: Record<string, unknown> = {
      durable_agent_submit: { submissionId: 's1', record: { id: 1, conversationId: 1, type: 'input', status: 'queued' } },
      durable_agent_write: { submissionId: 's2', record: { id: 2, conversationId: 1, type: 'write', status: 'placed' } },
      durable_agent_status: {
        rootConversationId: '1',
        inspection: { scheduling: 'running', tasks: [], submissions: [] },
        generationConfigured: false,
      },
      durable_agent_history: { items: [], next: undefined },
      durable_agent_fork: { conversationId: '2' },
      durable_agent_abort: { ok: true },
    }
    for (const def of defs) {
      const rendered = def.render({} as never, fakeValues[def.name] as never)
      expect(typeof rendered).toBe('string')
      expect(rendered.length).toBeGreaterThan(0)
    }
  })
})
