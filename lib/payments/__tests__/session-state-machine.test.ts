import { describe, it, expect } from 'vitest'
import { transitionSession } from '../session-state-machine'
import { SessionStatus } from '../types'

describe('transitionSession — valid transitions', () => {
  it('ouverte → payment_succeeded → reussie', () => {
    expect(transitionSession(SessionStatus.ouverte, 'payment_succeeded')).toBe(SessionStatus.reussie)
  })

  it('ouverte → abandon → abandonnee', () => {
    expect(transitionSession(SessionStatus.ouverte, 'abandon')).toBe(SessionStatus.abandonnee)
  })

  it('ouverte → expire → expiree', () => {
    expect(transitionSession(SessionStatus.ouverte, 'expire')).toBe(SessionStatus.expiree)
  })

  it('expiree → late_payment_succeeded → reussie (late webhook)', () => {
    expect(transitionSession(SessionStatus.expiree, 'late_payment_succeeded')).toBe(SessionStatus.reussie)
  })

  it('abandonnee → late_payment_succeeded → reussie (late webhook)', () => {
    expect(transitionSession(SessionStatus.abandonnee, 'late_payment_succeeded')).toBe(SessionStatus.reussie)
  })
})

describe('transitionSession — invalid transitions', () => {
  it('reussie → any event → Error', () => {
    expect(transitionSession(SessionStatus.reussie, 'payment_succeeded')).toBeInstanceOf(Error)
    expect(transitionSession(SessionStatus.reussie, 'abandon')).toBeInstanceOf(Error)
  })

  it('expiree → payment_succeeded (not late) → Error', () => {
    expect(transitionSession(SessionStatus.expiree, 'payment_succeeded')).toBeInstanceOf(Error)
  })

  it('abandonnee → expire → Error', () => {
    expect(transitionSession(SessionStatus.abandonnee, 'expire')).toBeInstanceOf(Error)
  })
})
