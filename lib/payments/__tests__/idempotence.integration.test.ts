/**
 * Integration test — runs against the real remote Supabase database.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Skipped automatically in CI (env vars absent) and in the default `npm test` run
 * (vitest.config.ts excludes *.integration.test.ts).
 * Run explicitly: npm run test:integration
 *
 * Tests the non-null gateway_credential_id path (paid transactions), which is
 * the primary production use case and maps to the UNIQUE(gateway_credential_id,
 * external_id) constraint that ON CONFLICT can target directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { upsertTransaction, writeTransactionStatus } from '../idempotence'
import { verifyAndFetchStatus } from '../verify-transaction'
import { TransactionStatus } from '../types'

const SKIP =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY

// ---------------------------------------------------------------------------
describe.skipIf(SKIP)('upsertTransaction — concurrent integration (real DB)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any
  let userId: string
  let sessionId: string
  let spaceId: string
  let paymentLinkId: string
  let gatewayCredentialId: string
  let gatewayCode: string
  let externalId: string
  let chaosExternalId: string

  // -------------------------------------------------------------------------
  beforeAll(async () => {
    db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    const ts = Date.now()
    externalId = `integration-upsert-${ts}`
    chaosExternalId = `chaos-replay-${ts}`
    gatewayCode = `test_gw_${ts}`

    // 1. Test gateway (reference table, cleaned up in afterAll)
    const { error: gwErr } = await db
      .from('gateways')
      .insert({ code: gatewayCode, name: 'Integration Test Gateway' })
    if (gwErr) throw gwErr

    // 2. Auth user → account → space → offer → payment_link → customer → session
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: `test-${ts}@siopay-integration.test`,
      password: 'unused-test-password',
      email_confirm: true,
    })
    if (authErr) throw authErr
    userId = authData.user.id

    const { data: acct, error: acctErr } = await db
      .from('accounts')
      .insert({ user_id: userId, currency_zone: 'XOF', display_currency: 'XOF' })
      .select('id').single()
    if (acctErr) throw acctErr

    const { data: sp, error: spErr } = await db
      .from('spaces')
      .insert({ account_id: acct.id, name: 'Integration Test Space', slug: `it-space-${ts}` })
      .select('id').single()
    if (spErr) throw spErr
    spaceId = sp.id

    // 3. Gateway credential (bytea column accepts a Node.js Buffer via the client)
    const { data: gwCred, error: gwCredErr } = await db
      .from('gateway_credentials')
      .insert({
        space_id: spaceId,
        gateway: gatewayCode,
        credentials_encrypted: Buffer.from('fake-test-credentials'),
        currency: 'XOF',
      })
      .select('id').single()
    if (gwCredErr) throw gwCredErr
    gatewayCredentialId = gwCred.id

    const { data: off, error: offErr } = await db
      .from('offers')
      .insert({
        space_id: spaceId,
        title: 'Integration Test Offer',
        delivery_config: { type: 'manual' },
        base_price_amount: 5000,
        base_price_currency: 'XOF',
        payment_mode: 'unique',
      })
      .select('id').single()
    if (offErr) throw offErr

    const { data: pl, error: plErr } = await db
      .from('payment_links')
      .insert({
        offer_id: off.id,
        space_id: spaceId,
        title: 'Integration Test Link',
        slug: `it-link-${ts}`,
      })
      .select('id').single()
    if (plErr) throw plErr
    paymentLinkId = pl.id

    const { data: cust, error: custErr } = await db
      .from('customers')
      .insert({ space_id: spaceId, email: `buyer-${ts}@integration.test` })
      .select('id').single()
    if (custErr) throw custErr

    const { data: sess, error: sessErr } = await db
      .from('checkout_sessions')
      .insert({
        payment_link_id: paymentLinkId,
        customer_id: cust.id,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .select('id').single()
    if (sessErr) throw sessErr
    sessionId = sess.id
  })

  // -------------------------------------------------------------------------
  afterAll(async () => {
    if (!db) return
    // Delete in FK dependency order (RESTRICT constraints govern the sequence).
    // transactions → checkout_sessions → payment_links
    // → auth user cascade (account → space → gateway_credentials, customers, offers)
    // → gateways (reference row, no FK pointing back to it after space is gone)
    await db
      .from('transactions')
      .delete()
      .eq('gateway_credential_id', gatewayCredentialId)
    if (sessionId) {
      await db.from('checkout_sessions').delete().eq('id', sessionId)
    }
    if (paymentLinkId) {
      await db.from('payment_links').delete().eq('id', paymentLinkId)
    }
    // Deleting the auth user cascades: account → space → gateway_credentials,
    // customers, offers (all have ON DELETE CASCADE from space_id).
    if (userId) {
      await db.auth.admin.deleteUser(userId)
    }
    if (gatewayCode) {
      await db.from('gateways').delete().eq('code', gatewayCode)
    }
  })

  // -------------------------------------------------------------------------
  it('3 concurrent calls with the same (gateway_credential_id, external_id) create exactly one row in the DB', async () => {
    const payload = {
      session_id: sessionId,
      space_id: spaceId,   // overridden by trigger, value here is ignored
      external_id: externalId,
      gateway_credential_id: gatewayCredentialId,
      amount: 5000,
      currency: 'XOF',
    }

    const [r1, r2, r3] = await Promise.all([
      upsertTransaction(payload),
      upsertTransaction(payload),
      upsertTransaction(payload),
    ])

    // Exactly one winner, two losers.
    const results = [r1, r2, r3]
    expect(results.filter(r => r.created === true)).toHaveLength(1)
    expect(results.filter(r => r.created === false)).toHaveLength(2)

    // Ground truth: count rows in the real DB.
    const { count, error } = await db
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('external_id', externalId)
      .eq('gateway_credential_id', gatewayCredentialId)
    expect(error).toBeNull()
    expect(count).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('10 chaotic replays: 1 row, correct final status, anti-rafale respected', async () => {
    const payload = {
      session_id: sessionId,
      space_id: spaceId,
      external_id: chaosExternalId,
      gateway_credential_id: gatewayCredentialId,
      amount: 5000,
      currency: 'XOF',
    }

    let providerCalls = 0
    const mockProvider = {
      getTransactionStatus: async () => {
        providerCalls++
        return { status: 'succeeded' as const }
      },
    }

    // --- Replay 1: upsert creates the row (pending) ---
    const { row, created } = await upsertTransaction(payload)
    expect(created).toBe(true)
    expect(row.payment_status).toBe('pending')
    const txId = row.id

    // --- Replay 2: start_processing webhook → pending → processing ---
    const r2 = await writeTransactionStatus(txId, TransactionStatus.pending, 'start_processing')
    expect(r2).toBe(TransactionStatus.processing)

    // --- Replay 3: poll (provider reports succeeded while we're still processing) ---
    // Gateway already resolved the payment; our DB is still in "processing".
    const r3 = await verifyAndFetchStatus(chaosExternalId, mockProvider, 5_000)
    expect(r3).not.toBeNull()
    expect(r3!.newStatus).toBe(TransactionStatus.succeeded)
    expect(providerCalls).toBe(1)

    // --- Replay 4: poll again within 5 s → anti-rafale throttled ---
    const r4 = await verifyAndFetchStatus(chaosExternalId, mockProvider, 5_000)
    expect(r4).toBeNull()
    expect(providerCalls).toBe(1) // no new outbound call

    // --- Replay 5: stale start_processing webhook → terminal, rejected ---
    await expect(
      writeTransactionStatus(txId, TransactionStatus.succeeded, 'start_processing'),
    ).rejects.toThrow()

    // --- Replay 6: duplicate upsert → idempotent, created: false ---
    const r6 = await upsertTransaction(payload)
    expect(r6.created).toBe(false)

    // --- Replay 7: contradictory payment_failed → terminal, rejected ---
    await expect(
      writeTransactionStatus(txId, TransactionStatus.succeeded, 'payment_failed'),
    ).rejects.toThrow()

    // --- Replay 8: expire attempt → terminal, rejected ---
    await expect(
      writeTransactionStatus(txId, TransactionStatus.succeeded, 'expire'),
    ).rejects.toThrow()

    // --- Replay 9: poll with interval=0 → terminal short-circuit ---
    const r9 = await verifyAndFetchStatus(chaosExternalId, mockProvider, 0)
    expect(r9).toBeNull()
    expect(providerCalls).toBe(1) // terminal check prevented outbound call

    // --- Replay 10: final duplicate succeeded → terminal, rejected ---
    await expect(
      writeTransactionStatus(txId, TransactionStatus.succeeded, 'payment_succeeded'),
    ).rejects.toThrow()

    // === FINAL VERIFICATION ===

    // 1. Exactly 1 row in DB for this reference
    const { count, error: countErr } = await db
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('external_id', chaosExternalId)
      .eq('gateway_credential_id', gatewayCredentialId)
    expect(countErr).toBeNull()
    expect(count).toBe(1)

    // 2. Final status is succeeded — never rolled back
    const { data: finalRow, error: rowErr } = await db
      .from('transactions')
      .select('payment_status')
      .eq('id', txId)
      .single()
    expect(rowErr).toBeNull()
    expect(finalRow.payment_status).toBe('succeeded')

    // 3. Anti-rafale: only 1 outbound call out of 3 polls
    //    - Poll 1 (replay 3): processed → processing → succeeded
    //    - Poll 2 (replay 4): throttled by anti-rafale (same ref within 5 s)
    //    - Poll 3 (replay 9): blocked by terminal check (succeeded)
    expect(providerCalls).toBe(1)
  })

  // -------------------------------------------------------------------------
  it('2 concurrent CAS writes on the same row: exactly one wins, DB reflects the winner', async () => {
    const casExternalId = `cas-race-${Date.now()}`
    const payload = {
      session_id: sessionId,
      space_id: spaceId,
      external_id: casExternalId,
      gateway_credential_id: gatewayCredentialId,
      amount: 5000,
      currency: 'XOF',
    }

    // Create a transaction in pending state.
    const { row } = await upsertTransaction(payload)
    expect(row.payment_status).toBe('pending')
    const txId = row.id

    // Fire two CAS writes concurrently, both reading "pending" as the
    // expected current status.  The DB decides which UPDATE commits first;
    // the loser's WHERE payment_status = 'pending' matches zero rows.
    //   A: pending → processing  (start_processing)
    //   B: pending → succeeded   (payment_succeeded)
    const [a, b] = await Promise.all([
      writeTransactionStatus(txId, TransactionStatus.pending, 'start_processing'),
      writeTransactionStatus(txId, TransactionStatus.pending, 'payment_succeeded'),
    ])

    // Exactly one winner (non-null), one loser (null).
    const results = [a, b]
    expect(results.filter(r => r !== null)).toHaveLength(1)
    expect(results.filter(r => r === null)).toHaveLength(1)

    // The winner determined the final state.
    const winner = a ?? b
    expect([TransactionStatus.processing, TransactionStatus.succeeded]).toContain(winner)

    // Ground truth: the real DB state matches the value returned by the winner.
    const { data: finalRow, error } = await db
      .from('transactions')
      .select('payment_status')
      .eq('id', txId)
      .single()
    expect(error).toBeNull()
    expect(finalRow.payment_status).toBe(winner)
  })
})
