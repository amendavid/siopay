import { describe, it, expect } from 'vitest'
import { transitionTransaction } from '../transaction-state-machine'
import { TransactionStatus } from '../types'

describe('transitionTransaction — valid transitions', () => {
  it('pending → start_processing → processing', () => {
    expect(transitionTransaction(TransactionStatus.pending, 'start_processing')).toBe(TransactionStatus.processing)
  })

  it('processing → payment_succeeded → succeeded', () => {
    expect(transitionTransaction(TransactionStatus.processing, 'payment_succeeded')).toBe(TransactionStatus.succeeded)
  })

  it('processing → payment_failed → failed', () => {
    expect(transitionTransaction(TransactionStatus.processing, 'payment_failed')).toBe(TransactionStatus.failed)
  })

  it('processing → expire → expired', () => {
    expect(transitionTransaction(TransactionStatus.processing, 'expire')).toBe(TransactionStatus.expired)
  })

  it('expired → late_webhook_succeeded → succeeded', () => {
    expect(transitionTransaction(TransactionStatus.expired, 'late_webhook_succeeded')).toBe(TransactionStatus.succeeded)
  })

  it('expired → late_webhook_failed → failed', () => {
    expect(transitionTransaction(TransactionStatus.expired, 'late_webhook_failed')).toBe(TransactionStatus.failed)
  })

  it('pending → payment_succeeded (skipping processing) → succeeded', () => {
    expect(transitionTransaction(TransactionStatus.pending, 'payment_succeeded')).toBe(TransactionStatus.succeeded)
  })

  it('pending → payment_failed (skipping processing) → failed', () => {
    expect(transitionTransaction(TransactionStatus.pending, 'payment_failed')).toBe(TransactionStatus.failed)
  })
})

describe('transitionTransaction — invalid transitions', () => {
  it('succeeded → any event → Error (no refund, no reopening)', () => {
    expect(transitionTransaction(TransactionStatus.succeeded, 'payment_failed')).toBeInstanceOf(Error)
    expect(transitionTransaction(TransactionStatus.succeeded, 'start_processing')).toBeInstanceOf(Error)
    expect(transitionTransaction(TransactionStatus.succeeded, 'expire')).toBeInstanceOf(Error)
  })

  it('failed → any event → Error', () => {
    expect(transitionTransaction(TransactionStatus.failed, 'payment_succeeded')).toBeInstanceOf(Error)
  })

  it('expired → payment_succeeded (not via late webhook) → Error', () => {
    expect(transitionTransaction(TransactionStatus.expired, 'payment_succeeded')).toBeInstanceOf(Error)
  })
})
