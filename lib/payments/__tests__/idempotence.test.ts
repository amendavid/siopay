import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeTransactionStatus, upsertTransaction } from '../idempotence'
import { TransactionStatus } from '../types'

// ---------------------------------------------------------------------------
// Supabase DB mock — chain built bottom-up so the shape survives vi.clearAllMocks().
// transaction-state-machine is intentionally NOT mocked so writeTransactionStatus
// exercises real business-rule validation logic.
// ---------------------------------------------------------------------------
const mockMaybeSingle = vi.fn()

// .select() on from() returns a builder that chains .eq().eq()...maybeSingle()
const eqBuilder: Record<string, unknown> = { maybeSingle: mockMaybeSingle }
const mockEq = vi.fn(() => eqBuilder)
eqBuilder.eq = mockEq  // self-referential: .eq().eq()...

// upsert() → select() → { data, error } (no .single() — returns array)
const mockUpsertSelect = vi.fn()
const mockUpsert = vi.fn(() => ({ select: mockUpsertSelect }))

const mockFrom = vi.fn(() => ({
  select: vi.fn(() => eqBuilder),
  upsert: mockUpsert,
}))

vi.mock('@/lib/db/client', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const baseRow = {
  id: 'tx-1',
  session_id: 'sess-1',
  space_id: 'space-1',
  external_id: 'ext-ref-001',
  gateway_credential_id: 'gw-cred-1',
  payment_status: 'pending' as TransactionStatus,
  amount: 5000,
  currency: 'XOF',
}

const upsertPayload = {
  session_id: 'sess-1',
  space_id: 'space-1',
  external_id: 'ext-ref-001',
  gateway_credential_id: 'gw-cred-1',
  amount: 5000,
  currency: 'XOF',
}

// ---------------------------------------------------------------------------
describe('writeTransactionStatus — business validation', () => {
  it('throws and never touches the DB when the transition is illegal (succeeded → payment_failed)', async () => {
    await expect(
      writeTransactionStatus('tx-1', TransactionStatus.succeeded, 'payment_failed'),
    ).rejects.toThrow()
    expect(mockFrom).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
describe('upsertTransaction — idempotence', () => {
  it('returns created: true when upsert inserts, created: false when it conflicts', async () => {
    // First call: DB returns the new row (INSERT succeeded).
    mockUpsertSelect.mockResolvedValueOnce({ data: [baseRow], error: null })
    // Second call: DB returns empty (ON CONFLICT DO NOTHING).
    mockUpsertSelect.mockResolvedValueOnce({ data: [], error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: baseRow, error: null })
    // Third call: same conflict path.
    mockUpsertSelect.mockResolvedValueOnce({ data: [], error: null })
    mockMaybeSingle.mockResolvedValueOnce({ data: baseRow, error: null })

    const first = await upsertTransaction(upsertPayload)
    const second = await upsertTransaction(upsertPayload)
    const third = await upsertTransaction(upsertPayload)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(third.created).toBe(false)
    // All three calls attempted the upsert; only the first inserted.
    expect(mockUpsert).toHaveBeenCalledTimes(3)
  })

  it('inserts with payment_status = pending', async () => {
    mockUpsertSelect.mockResolvedValueOnce({ data: [baseRow], error: null })

    await upsertTransaction(upsertPayload)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'pending' }),
      expect.any(Object),
    )
  })
})
