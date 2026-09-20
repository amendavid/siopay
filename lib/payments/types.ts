// Const objects instead of TypeScript enums: better serialisation,
// no double-compilation artefact, easier to test against raw strings.

export const TransactionStatus = {
  pending: 'pending',
  processing: 'processing',
  succeeded: 'succeeded',
  failed: 'failed',
  expired: 'expired',
} as const
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus]

export const SessionStatus = {
  ouverte: 'ouverte',
  reussie: 'reussie',
  abandonnee: 'abandonnee',
  expiree: 'expiree',
} as const
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus]

export const FailureReason = {
  insufficient_balance: 'insufficient_balance',
  operator_timeout: 'operator_timeout',
  user_cancelled: 'user_cancelled',
  invalid_number: 'invalid_number',
  unknown: 'unknown',
} as const
export type FailureReason = (typeof FailureReason)[keyof typeof FailureReason]
