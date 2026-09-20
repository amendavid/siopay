/**
 * Validates a payment amount: must be a positive integer (minor currency unit).
 * Returns the validated number or an Error — never throws.
 */
export function validateAmount(value: unknown): number | Error {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return new Error(`Invalid amount: expected a positive integer, got ${JSON.stringify(value)}`)
  }
  return value
}

/**
 * Validates a currency code against a caller-supplied set of known codes.
 * The set comes from the `currencies` table — never a hardcoded constant.
 */
export function validateCurrency(
  value: unknown,
  validCodes: ReadonlySet<string>,
): string | Error {
  if (typeof value !== 'string' || !validCodes.has(value)) {
    return new Error(`Unknown or invalid currency: ${JSON.stringify(value)}`)
  }
  return value
}
