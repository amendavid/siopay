import { describe, it, expect } from 'vitest'
import { validateAmount, validateCurrency } from '../validation'

const CURRENCIES = new Set(['XOF', 'GHS', 'NGN', 'EUR'])

describe('validateAmount', () => {
  it('accepts a positive integer', () => {
    expect(validateAmount(5000)).toBe(5000)
  })

  it('rejects zero', () => {
    expect(validateAmount(0)).toBeInstanceOf(Error)
  })

  it('rejects a negative integer', () => {
    expect(validateAmount(-1)).toBeInstanceOf(Error)
  })

  it('rejects a float', () => {
    expect(validateAmount(49.99)).toBeInstanceOf(Error)
  })

  it('rejects a string', () => {
    expect(validateAmount('5000')).toBeInstanceOf(Error)
  })

  it('rejects null and undefined', () => {
    expect(validateAmount(null)).toBeInstanceOf(Error)
    expect(validateAmount(undefined)).toBeInstanceOf(Error)
  })
})

describe('validateCurrency', () => {
  it('accepts a known code', () => {
    expect(validateCurrency('XOF', CURRENCIES)).toBe('XOF')
  })

  it('rejects an unknown code', () => {
    expect(validateCurrency('USD', CURRENCIES)).toBeInstanceOf(Error)
  })

  it('rejects a non-string', () => {
    expect(validateCurrency(42, CURRENCIES)).toBeInstanceOf(Error)
    expect(validateCurrency(null, CURRENCIES)).toBeInstanceOf(Error)
  })
})
