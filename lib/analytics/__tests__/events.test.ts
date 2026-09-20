import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logEvent } from '../events'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// Stable spies — declared before the mock factory so the factory can close
// over them; reset between tests via vi.clearAllMocks().
const mockInsert = vi.fn(() => Promise.resolve({ error: null }))
const mockFrom = vi.fn(() => ({ insert: mockInsert }))

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

function getInsertCall() {
  return mockInsert.mock.calls[0]?.[0] as Record<string, unknown> | undefined
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInsert.mockResolvedValue({ error: null })
})

describe('logEvent — transaction_id requirement', () => {
  it('payment_succeeded: inserts with the provided transaction_id (non-null)', async () => {
    await logEvent({
      type: 'payment_succeeded',
      space_id: 'space-1',
      session_id: 'sess-1',
      transaction_id: 'tx-abc',
    })
    const payload = getInsertCall()
    expect(payload?.transaction_id).toBe('tx-abc')
    expect(payload?.type).toBe('payment_succeeded')
  })

  it('payment_failed: inserts with the provided transaction_id (non-null)', async () => {
    await logEvent({
      type: 'payment_failed',
      space_id: 'space-1',
      session_id: 'sess-1',
      transaction_id: 'tx-def',
      failure_reason: 'insufficient_balance',
    })
    const payload = getInsertCall()
    expect(payload?.transaction_id).toBe('tx-def')
    expect(payload?.type).toBe('payment_failed')
  })

  it('checkout_started: inserts with transaction_id = null', async () => {
    await logEvent({
      type: 'checkout_started',
      space_id: 'space-1',
      session_id: 'sess-1',
    })
    const payload = getInsertCall()
    expect(payload?.transaction_id).toBeNull()
    expect(payload?.type).toBe('checkout_started')
  })
})

describe('logEvent — compile-time enforcement', () => {
  it('payment_succeeded without transaction_id should not type-check', () => {
    // This test documents the type-level guarantee.
    // If TypeScript accepts the line below without error, the constraint is broken.
    // @ts-expect-error transaction_id is required for payment_succeeded
    const _bad = () => logEvent({ type: 'payment_succeeded', space_id: 's', session_id: 'ss' })
    expect(typeof _bad).toBe('function') // the test itself always passes; TS error is the assertion
  })
})
