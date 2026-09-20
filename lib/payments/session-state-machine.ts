import { SessionStatus } from './types'

export type SessionEvent =
  | 'payment_succeeded'
  | 'abandon'
  | 'expire'
  | 'late_payment_succeeded'

const VALID_TRANSITIONS: Record<SessionStatus, Partial<Record<SessionEvent, SessionStatus>>> = {
  ouverte: {
    payment_succeeded: 'reussie',
    abandon: 'abandonnee',
    expire: 'expiree',
  },
  expiree: {
    late_payment_succeeded: 'reussie',
  },
  abandonnee: {
    late_payment_succeeded: 'reussie',
  },
  reussie: {},
}

export function transitionSession(
  current: SessionStatus,
  event: SessionEvent,
): SessionStatus | Error {
  const next = VALID_TRANSITIONS[current][event]
  if (next === undefined) {
    return new Error(`Invalid session transition: ${current} → ${event}`)
  }
  return next
}
