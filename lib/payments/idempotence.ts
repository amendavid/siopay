import { createServerClient } from '@/lib/db/client'
import { transitionTransaction, type TransactionEvent } from './transaction-state-machine'
import type { TransactionStatus } from './types'

export interface TransactionRow {
  id: string
  session_id: string
  space_id: string
  external_id: string
  gateway_credential_id: string | null
  payment_status: TransactionStatus
  amount: number
  currency: string
}

/**
 * Finds a transaction by its gateway reference.
 * Returns null if none exists (unknown reference → silent 200).
 */
export async function findTransactionByExternalId(
  externalId: string,
  gatewayCredentialId?: string,
): Promise<TransactionRow | null> {
  const db = createServerClient()
  let query = db
    .from('transactions')
    .select('id, session_id, space_id, external_id, gateway_credential_id, payment_status, amount, currency')
    .eq('external_id', externalId)

  if (gatewayCredentialId !== undefined) {
    query = query.eq('gateway_credential_id', gatewayCredentialId)
  }

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as TransactionRow | null
}

/**
 * Validates that `event` is a legal transition from `expectedCurrentStatus`,
 * then performs a compare-and-swap write on payment_status.
 *
 * Self-contained: callers do not need to call transitionTransaction separately.
 * Returns the new status if the row was updated, null if another writer
 * already moved it (0 rows affected → the caller should re-read and retry).
 * Throws if the requested transition is not business-legal.
 */
export async function writeTransactionStatus(
  transactionId: string,
  expectedCurrentStatus: TransactionStatus,
  event: TransactionEvent,
): Promise<TransactionStatus | null> {
  const next = transitionTransaction(expectedCurrentStatus, event)
  if (next instanceof Error) throw next

  const db = createServerClient()
  const { count, error } = await db
    .from('transactions')
    .update({ payment_status: next })
    .eq('id', transactionId)
    .eq('payment_status', expectedCurrentStatus)
    .select('id', { count: 'exact', head: true })

  if (error) throw error
  return (count ?? 0) > 0 ? next : null
}

/**
 * Finds an existing transaction by gateway reference or creates it.
 * Protects against duplicate creation via the UNIQUE constraint on
 * (gateway_credential_id, external_id): a concurrent insert for the same
 * reference will fail at the DB level and be surfaced as a thrown error.
 * Returns { row, created: true } on first insert, { row, created: false }
 * on subsequent calls.
 *
 * Called by initiatePayment() in S4 when SioPay itself initiates a payment
 * with the gateway and needs to record the transaction exactly once.
 * NOT called by the webhook handler — webhooks only look up existing
 * transactions via findTransactionByExternalId(), they never create them.
 */
export async function upsertTransaction(payload: {
  session_id: string
  space_id: string
  external_id: string
  gateway_credential_id: string | null
  amount: number
  currency: string
}): Promise<{ row: TransactionRow; created: boolean }> {
  const existing = await findTransactionByExternalId(
    payload.external_id,
    payload.gateway_credential_id ?? undefined,
  )
  if (existing) return { row: existing, created: false }

  const db = createServerClient()
  const { data, error } = await db
    .from('transactions')
    .insert({
      session_id: payload.session_id,
      space_id: payload.space_id,
      external_id: payload.external_id,
      gateway_credential_id: payload.gateway_credential_id,
      amount: payload.amount,
      currency: payload.currency,
      payment_status: 'pending',
    })
    .select('id, session_id, space_id, external_id, gateway_credential_id, payment_status, amount, currency')
    .single()

  if (error) throw error
  return { row: data as TransactionRow, created: true }
}
