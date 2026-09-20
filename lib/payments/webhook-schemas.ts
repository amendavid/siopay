/**
 * Webhook schema registry.
 *
 * Each gateway registers its own schema (S4 for FedaPay, S5 for PayDunya).
 * The core never imports gateway-specific code directly.
 *
 * parseIncomingWebhook is a noise filter, not a security gate:
 * it rejects unknown event types (non-transactional webhooks a vendor
 * accidentally left enabled) before any DB read or outbound call.
 * Security comes from verifyAndFetchStatus (the outbound API call).
 */

export interface ParsedWebhookRef {
  externalId: string
}

export interface WebhookSchema {
  /** Returns the external reference, or null if the event should be ignored. */
  parse(raw: unknown): ParsedWebhookRef | null
}

const registry = new Map<string, WebhookSchema>()

export function registerWebhookSchema(gateway: string, schema: WebhookSchema): void {
  registry.set(gateway, schema)
}

export function parseIncomingWebhook(
  gateway: string,
  rawBody: unknown,
): ParsedWebhookRef | null {
  const schema = registry.get(gateway)
  if (!schema) return null
  return schema.parse(rawBody)
}
