import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeTransactionStatus, upsertTransaction } from '../idempotence'
import { TransactionStatus } from '../types'

// ---------------------------------------------------------------------------
// Supabase DB mock — chain built bottom-up so the shape survives vi.clearAllMocks().
// transaction-state-machine is intentionally NOT mocked: writeTransactionStatus
// tests exercise the real business-rule validation embedded in that function.
// ---------------------------------------------------------------------------
const mockMaybeSingle = vi.fn()
const mockSingle = vi.fn()

// .eq() is self-referential so .eq().eq()...maybeSingle() all resolve correctly.
const eqBuilder: Record<string, unknown> = { maybeSingle: mockMaybeSingle }
const mockEq = vi.fn(() => eqBuilder)
eqBuilder.eq = mockEq

// insert() → select() → single()
const mockInsert = vi.fn(() => ({
  select: vi.fn(() => ({ single: mockSingle })),
}))

// from() → { select (for reads), insert (for writes) }
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => eqBuilder),
  insert: mockInsert,
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
  it('returns created: true on the first call and created: false on the next two with the same reference', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })     // first find → row absent
      .mockResolvedValueOnce({ data: baseRow, error: null })  // second find → row present
      .mockResolvedValueOnce({ data: baseRow, error: null })  // third find → row present
    mockSingle.mockResolvedValueOnce({ data: baseRow, error: null }) // INSERT response

    const first = await upsertTransaction(upsertPayload)
    const second = await upsertTransaction(upsertPayload)
    const third = await upsertTransaction(upsertPayload)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(third.created).toBe(false)
    // Exactly one INSERT across the three calls
    expect(mockInsert).toHaveBeenCalledTimes(1)
  })

  it('inserts with payment_status = pending', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockSingle.mockResolvedValueOnce({ data: baseRow, error: null })

    await upsertTransaction(upsertPayload)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 'pending' }),
    )
  })
})
