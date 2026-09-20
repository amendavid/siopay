import { TransactionStatus } from './types'

export type TransactionEvent =
  | 'start_processing'
  | 'payment_succeeded'
  | 'payment_failed'
  | 'expire'
  | 'late_webhook_succeeded'
  | 'late_webhook_failed'

const VALID_TRANSITIONS: Record<TransactionStatus, Partial<Record<TransactionEvent, TransactionStatus>>> = {
  pending: {
    start_processing: 'processing',
    payment_succeeded: 'succeeded',
    payment_failed: 'failed',
  },
  processing: {
    payment_succeeded: 'succeeded',
    payment_failed: 'failed',
    expire: 'expired',
  },
  expired: {
    // Only a late webhook can resolve an expired transaction.
    late_webhook_succeeded: 'succeeded',
    late_webhook_failed: 'failed',
  },
  succeeded: {},
  failed: {},
}

export function transitionTransaction(
  current: TransactionStatus,
  event: TransactionEvent,
): TransactionStatus | Error {
  const next = VALID_TRANSITIONS[current][event]
  if (next === undefined) {
    return new Error(`Invalid transaction transition: ${current} → ${event}`)
  }
  return next
}
