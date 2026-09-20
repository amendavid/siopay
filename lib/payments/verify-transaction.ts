import * as Sentry from '@sentry/nextjs'
import { findTransactionByExternalId, writeTransactionStatus, type TransactionRow } from './idempotence'
import type { TransactionEvent } from './transaction-state-machine'
import { TransactionStatus } from './types'

export interface GatewayStatus {
  status: 'processing' | 'succeeded' | 'failed'
}

export interface GatewayStatusProvider {
  getTransactionStatus(externalId: string): Promise<GatewayStatus | null>
}

export interface VerifyResult {
  transaction: TransactionRow
  newStatus: TransactionStatus
}

/** Maps a gateway-reported status to the corresponding state machine event. */
function toTransactionEvent(gatewayStatus: GatewayStatus['status']): TransactionEvent {
  switch (gatewayStatus) {
    case 'processing':
      return 'start_processing'
    case 'succeeded':
      return 'payment_succeeded'
    case 'failed':
      return 'payment_failed'
  }
}

const TERMINAL: ReadonlySet<TransactionStatus> = new Set([
  TransactionStatus.succeeded,
  TransactionStatus.failed,
])

// Anti-rafale store: externalId → timestamp of last outbound call
const recentChecks = new Map<string, number>()

export async function verifyAndFetchStatus(
  externalId: string,
  provider: GatewayStatusProvider,
  minIntervalMs = 5_000,
): Promise<VerifyResult | null> {
  // 1. Anti-rafale: throttle repeated hits for the same reference.
  //    Stamp *before* the DB read so even unknown-reference floods are throttled.
  const lastCheck = recentChecks.get(externalId)
  if (lastCheck !== undefined && Date.now() - lastCheck < minIntervalMs) {
    return null
  }
  recentChecks.set(externalId, Date.now())

  // 2. Reject unknown references — no outbound call.
  const tx = await findTransactionByExternalId(externalId)
  if (!tx) return null

  // 3. Reject already-terminal transactions — no outbound call.
  if (TERMINAL.has(tx.payment_status as TransactionStatus)) return null

  // 4. Fetch real status from the gateway.
  const gatewayResult = await provider.getTransactionStatus(externalId)
  if (!gatewayResult) return null

  const event = toTransactionEvent(gatewayResult.status)

  // 5-6. writeTransactionStatus validates the transition AND does the CAS write.
  let next: TransactionStatus | null
  try {
    next = await writeTransactionStatus(tx.id, tx.payment_status as TransactionStatus, event)
  } catch (err) {
    // Illegal transition (e.g. expired → start_processing): log, silent 200.
    Sentry.captureException(err, { extra: { externalId, currentStatus: tx.payment_status } })
    return null
  }

  // CAS missed — retry once on concurrent conflict.
  if (next === null) {
    const refreshed = await findTransactionByExternalId(externalId)
    if (!refreshed || TERMINAL.has(refreshed.payment_status as TransactionStatus)) return null

    try {
      next = await writeTransactionStatus(refreshed.id, refreshed.payment_status as TransactionStatus, event)
    } catch {
      return null
    }
    if (next === null) return null

    return { transaction: refreshed, newStatus: next }
  }

  return { transaction: tx, newStatus: next }
}
