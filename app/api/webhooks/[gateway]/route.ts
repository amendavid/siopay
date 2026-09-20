import * as Sentry from '@sentry/nextjs'
import { parseIncomingWebhook } from '@/lib/payments/webhook-schemas'
import { verifyAndFetchStatus } from '@/lib/payments/verify-transaction'
import { logEvent } from '@/lib/analytics/events'
import { checkRateLimit } from '@/lib/rate-limit'
import { TransactionStatus } from '@/lib/payments/types'

// Rate limit: 60 webhook calls per minute per IP on this endpoint.
const RATE_LIMIT = { windowMs: 60_000, max: 60 }

/**
 * Placeholder webhook handler — S3.
 *
 * Orchestration: parseIncomingWebhook → verifyAndFetchStatus → logEvent
 * The gateway-specific status provider is a no-op mock until S4.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ gateway: string }> },
) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (!checkRateLimit(`webhook:${ip}`, RATE_LIMIT)) {
    return new Response(null, { status: 429 })
  }

  const { gateway } = await params

  // Parse body — any JSON parse failure → 200 (noise, not our problem).
  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return new Response(null, { status: 200 })
  }

  // Step 1 — noise filter: reject unknown event types immediately.
  const parsed = parseIncomingWebhook(gateway, rawBody)
  if (!parsed) return new Response(null, { status: 200 })

  // Step 2 — mock status provider (replaced by real gateway in S4).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mockProvider = { getTransactionStatus: (_: string) => Promise.resolve(null) }

  // Steps 2-5 — verify + CAS write (guards inside verifyAndFetchStatus).
  let result
  try {
    result = await verifyAndFetchStatus(parsed.externalId, mockProvider)
  } catch (err) {
    Sentry.captureException(err)
    return new Response(null, { status: 200 })
  }

  if (!result) return new Response(null, { status: 200 })

  // Step 6 — emit analytics event.
  const { transaction, newStatus } = result
  try {
    if (newStatus === TransactionStatus.succeeded) {
      await logEvent({
        type: 'payment_succeeded',
        space_id: transaction.space_id,
        session_id: transaction.session_id,
        transaction_id: transaction.id,
      })
    } else if (newStatus === TransactionStatus.failed) {
      await logEvent({
        type: 'payment_failed',
        space_id: transaction.space_id,
        session_id: transaction.session_id,
        transaction_id: transaction.id,
      })
    }
  } catch (err) {
    Sentry.captureException(err)
    // logEvent failure must never turn a 200 into a 5xx —
    // the transaction is already updated.
  }

  return new Response(null, { status: 200 })
}
