import { describe, it, expect, beforeAll } from 'vitest'
import { z } from 'zod'
import {
  registerWebhookSchema,
  parseIncomingWebhook,
  type WebhookSchema,
} from '../webhook-schemas'

// --- Test-gateway schema (generic, no real gateway names) ---
const testTransactionSchema = z.object({
  type: z.literal('transaction'),
  reference: z.string().min(1),
})

const testGatewaySchema: WebhookSchema = {
  parse(raw) {
    const result = testTransactionSchema.safeParse(raw)
    if (!result.success) return null
    return { externalId: result.data.reference }
  },
}

beforeAll(() => {
  registerWebhookSchema('test-gateway', testGatewaySchema)
})

describe('parseIncomingWebhook', () => {
  it('returns null for an unregistered gateway', () => {
    expect(parseIncomingWebhook('unknown-gateway', { type: 'transaction', reference: 'abc' })).toBeNull()
  })

  it('returns the externalId for a valid transactional event', () => {
    const result = parseIncomingWebhook('test-gateway', { type: 'transaction', reference: 'ref-001' })
    expect(result).toEqual({ externalId: 'ref-001' })
  })

  it('returns null for a non-transactional event type ("customer.updated")', () => {
    // This is THE key test: noise filtering before any DB read or outbound call.
    // The schema rejects this event because type !== 'transaction'.
    expect(parseIncomingWebhook('test-gateway', { type: 'customer.updated', reference: 'ref-001' })).toBeNull()
  })

  it('returns null when the reference field is missing', () => {
    expect(parseIncomingWebhook('test-gateway', { type: 'transaction' })).toBeNull()
  })

  it('returns null for an empty reference', () => {
    expect(parseIncomingWebhook('test-gateway', { type: 'transaction', reference: '' })).toBeNull()
  })

  it('returns null for a completely malformed payload', () => {
    expect(parseIncomingWebhook('test-gateway', null)).toBeNull()
    expect(parseIncomingWebhook('test-gateway', 'not-an-object')).toBeNull()
    expect(parseIncomingWebhook('test-gateway', 42)).toBeNull()
  })
})
