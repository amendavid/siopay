import { describe, it, expect, vi, beforeEach } from 'vitest'
import { verifyAndFetchStatus } from '../verify-transaction'
import { TransactionStatus } from '../types'

// Mock the idempotence module — no real DB in unit tests.
vi.mock('@/lib/payments/idempotence', () => ({
  findTransactionByExternalId: vi.fn(),
  writeTransactionStatus: vi.fn(),
}))

// Mock Sentry to avoid initialisation errors in test env.
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

import {
  findTransactionByExternalId,
  writeTransactionStatus,
} from '@/lib/payments/idempotence'

const mockFind = vi.mocked(findTransactionByExternalId)
const mockWrite = vi.mocked(writeTransactionStatus)

function makeTx(payment_status: TransactionStatus, ref = 'ref') {
  return {
    id: 'tx-1',
    session_id: 'sess-1',
    space_id: 'space-1',
    external_id: ref,
    gateway_credential_id: null,
    payment_status,
    amount: 5000,
    currency: 'XOF',
  }
}

const mockProvider = { getTransactionStatus: vi.fn() }

// Each test uses a unique externalId so the module-level anti-rafale Map
// never carries state from a previous test.
let seq = 0
function uniq() { return `ref-${++seq}` }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('verifyAndFetchStatus — silent rejections (no outbound call)', () => {
  it('returns null for an unknown reference', async () => {
    mockFind.mockResolvedValue(null)
    const result = await verifyAndFetchStatus(uniq(), mockProvider, 0)
    expect(result).toBeNull()
    expect(mockProvider.getTransactionStatus).not.toHaveBeenCalled()
  })

  it('returns null when the transaction is already succeeded', async () => {
    const ref = uniq()
    mockFind.mockResolvedValue(makeTx(TransactionStatus.succeeded, ref))
    const result = await verifyAndFetchStatus(ref, mockProvider, 0)
    expect(result).toBeNull()
    expect(mockProvider.getTransactionStatus).not.toHaveBeenCalled()
  })

  it('returns null when the transaction is already failed', async () => {
    const ref = uniq()
    mockFind.mockResolvedValue(makeTx(TransactionStatus.failed, ref))
    const result = await verifyAndFetchStatus(ref, mockProvider, 0)
    expect(result).toBeNull()
    expect(mockProvider.getTransactionStatus).not.toHaveBeenCalled()
  })
})

describe('verifyAndFetchStatus — successful resolution', () => {
  it('returns the new status when gateway reports succeeded', async () => {
    const ref = uniq()
    mockFind.mockResolvedValue(makeTx(TransactionStatus.processing, ref))
    mockProvider.getTransactionStatus.mockResolvedValue({ status: 'succeeded' })
    mockWrite.mockResolvedValue(TransactionStatus.succeeded)

    const result = await verifyAndFetchStatus(ref, mockProvider, 0)
    expect(result).not.toBeNull()
    expect(result?.newStatus).toBe(TransactionStatus.succeeded)
    // writeTransactionStatus now receives an event, not a raw status
    expect(mockWrite).toHaveBeenCalledWith('tx-1', 'processing', 'payment_succeeded')
  })

  it('returns the new status when gateway reports failed', async () => {
    const ref = uniq()
    mockFind.mockResolvedValue(makeTx(TransactionStatus.processing, ref))
    mockProvider.getTransactionStatus.mockResolvedValue({ status: 'failed' })
    mockWrite.mockResolvedValue(TransactionStatus.failed)

    const result = await verifyAndFetchStatus(ref, mockProvider, 0)
    expect(result?.newStatus).toBe(TransactionStatus.failed)
  })
})

describe('verifyAndFetchStatus — anti-rafale', () => {
  it('throttles a second call within the minimum interval', async () => {
    const ref = uniq() // fresh ref → Map has no prior entry
    mockFind.mockResolvedValue(makeTx(TransactionStatus.processing, ref))
    mockProvider.getTransactionStatus.mockResolvedValue({ status: 'succeeded' })
    mockWrite.mockResolvedValue(TransactionStatus.succeeded)

    // First call — succeeds and stamps the Map.
    const first = await verifyAndFetchStatus(ref, mockProvider, 60_000)
    expect(first).not.toBeNull()

    // Second call within 60 s → throttled.
    const second = await verifyAndFetchStatus(ref, mockProvider, 60_000)
    expect(second).toBeNull()
    expect(mockProvider.getTransactionStatus).toHaveBeenCalledTimes(1)
  })

  it('allows calls when minIntervalMs = 0 (interval already elapsed)', async () => {
    const ref = uniq()
    mockFind.mockResolvedValue(makeTx(TransactionStatus.processing, ref))
    mockProvider.getTransactionStatus.mockResolvedValue({ status: 'succeeded' })
    mockWrite.mockResolvedValue(TransactionStatus.succeeded)

    await verifyAndFetchStatus(ref, mockProvider, 0)
    await verifyAndFetchStatus(ref, mockProvider, 0)
    expect(mockProvider.getTransactionStatus).toHaveBeenCalledTimes(2)
  })
})

describe('verifyAndFetchStatus — CAS retry on concurrent write', () => {
  it('retries once when the first CAS write is lost', async () => {
    const ref = uniq()
    const processing = makeTx(TransactionStatus.processing, ref)
    mockFind
      .mockResolvedValueOnce(processing)
      .mockResolvedValueOnce(processing)
    mockProvider.getTransactionStatus.mockResolvedValue({ status: 'succeeded' })
    mockWrite.mockResolvedValueOnce(null).mockResolvedValueOnce(TransactionStatus.succeeded)

    const result = await verifyAndFetchStatus(ref, mockProvider, 0)
    expect(result?.newStatus).toBe(TransactionStatus.succeeded)
    expect(mockWrite).toHaveBeenCalledTimes(2)
  })
})
