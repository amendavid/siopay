/**
 * Basic in-memory rate limiter.
 * One Map entry per key; entries expire after their window.
 * Replaced by @upstash/ratelimit in S17.
 */

interface Entry {
  count: number
  resetAt: number
}

const store = new Map<string, Entry>()

export interface RateLimitOptions {
  /** Duration of the sliding window in milliseconds. */
  windowMs: number
  /** Maximum number of requests allowed within the window. */
  max: number
}

/**
 * Returns true if the request is within the limit, false if it should be
 * rejected. Increments the counter as a side effect.
 */
export function checkRateLimit(key: string, options: RateLimitOptions): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + options.windowMs })
    return true
  }

  if (entry.count >= options.max) return false

  entry.count++
  return true
}
