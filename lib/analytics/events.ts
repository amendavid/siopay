import * as Sentry from '@sentry/nextjs'
import { createServerClient } from '@/lib/db/client'

export type EventType =
  | 'checkout_started'
  | 'checkout_step_completed'
  | 'payment_attempted'
  | 'payment_succeeded'
  | 'payment_failed'

interface BaseFields {
  space_id: string
  session_id: string
  customer_id?: string
}

// payment_succeeded and payment_failed MUST carry a transaction_id.
// This constraint is enforced at the type level, not at runtime.
type PaymentFields = BaseFields & { transaction_id: string }

export type LogEventInput =
  | ({ type: 'checkout_started' } & BaseFields)
  | ({ type: 'checkout_step_completed'; step: string } & BaseFields)
  | ({ type: 'payment_attempted' } & PaymentFields)
  | ({ type: 'payment_succeeded' } & PaymentFields)
  | ({ type: 'payment_failed'; failure_reason?: string } & PaymentFields)

export async function logEvent(input: LogEventInput): Promise<void> {
  const db = createServerClient()

  const payload: Record<string, unknown> = { type: input.type }
  if (input.type === 'checkout_step_completed') payload.step = input.step
  if (input.type === 'payment_failed' && input.failure_reason) {
    payload.failure_reason = input.failure_reason
  }

  const { error } = await db.from('events').insert({
    type: input.type,
    space_id: input.space_id,
    session_id: input.session_id,
    transaction_id: 'transaction_id' in input ? input.transaction_id : null,
    customer_id: input.customer_id ?? null,
    payload,
  })

  if (error) {
    Sentry.captureException(error, { extra: { event_type: input.type } })
    throw error
  }
}
