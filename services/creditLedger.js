"use strict";

// creditLedger.js — Shadow-mode credit ledger service.
//
// ALL functions in this file are fire-and-forget safe:
//   - They return Promise<void> (or a small result for internal chaining).
//   - They catch all errors internally and never throw.
//   - Callers must wrap calls in setImmediate(() => fn().catch(() => {}))
//     so that shadow latency never blocks the HTTP response path.
//
// Shadow mode contract:
//   - These functions WRITE to the ledger tables only.
//   - They do NOT read from ledger tables for any billing decision.
//   - generations_limit / generations_used remain the sole live billing gate.
//   - A Supabase outage causes silent shadow failures — live generation is unaffected.
//
// Requires in .env (local and Render — added when shadow writes are enabled):
//   SUPABASE_URL              — e.g. https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service role key (never the anon key)

const fetch = require("node-fetch");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getEnv() {
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return { url, key };
}

function isConfigured() {
  const { url, key } = getEnv();
  return Boolean(url && key);
}

function restUrl(table) {
  const { url } = getEnv();
  return `${url}/rest/v1/${table}`;
}

function headers(extra = {}) {
  const { key } = getEnv();
  return {
    "apikey":        key,
    "Authorization": `Bearer ${key}`,
    "Content-Type":  "application/json",
    ...extra,
  };
}

function logShadowError(fn, err) {
  console.error(`[shadow-ledger] ${fn} failed:`, err?.message || err);
}

// ---------------------------------------------------------------------------
// shadowLogWebhookEvent
//
// Inserts one row into dodo_webhook_events.
// Uses resolution=ignore-duplicates so Dodo re-deliveries are silently skipped.
// Call this at the very start of any Dodo webhook handler, before existing logic.
//
// @param {string} eventId    — Dodo's own event identifier
// @param {string} eventType  — e.g. 'subscription.renewed', 'payment.succeeded'
// @param {object} payload    — full raw webhook payload
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function shadowLogWebhookEvent(eventId, eventType, payload) {
  if (!isConfigured()) {
    console.warn("[shadow-ledger] shadowLogWebhookEvent: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return;
  }
  try {
    const res = await fetch(restUrl("dodo_webhook_events"), {
      method: "POST",
      headers: headers({ "Prefer": "resolution=ignore-duplicates,return=minimal" }),
      body: JSON.stringify({ event_id: eventId, event_type: eventType, payload }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logShadowError("shadowLogWebhookEvent", new Error(`HTTP ${res.status}: ${detail}`));
    }
  } catch (err) {
    logShadowError("shadowLogWebhookEvent", err);
  }
}

// ---------------------------------------------------------------------------
// shadowGrantCredits
//
// Inserts one row into credit_grants.
//
// grant_type values and caller context:
//   'free_signup'              — called from account creation handler
//   'monthly_pro'              — called after Dodo subscription.renewed event
//   'one_time_pack'            — called after Dodo one-time payment.succeeded event
//   'referral_bonus'           — called from referral award handler (do not touch referral logic yet)
//   'failed_generation_refund' — called from shadowRefundGeneration() only
//   'admin_grant'              — called from admin tooling
//
// @param {string}      userId
// @param {string}      grantType  — one of the values above
// @param {number}      credits    — must be > 0
// @param {string|null} sourceId   — Dodo subscription ID / payment ID / referral code / null
// @param {string|null} expiresAt  — ISO timestamp or null; monthly_pro must use Dodo renewal_date
// @param {object|null} metadata
// @returns {Promise<string|null>}  — inserted grant id, or null on error (for internal chaining)
// ---------------------------------------------------------------------------
async function shadowGrantCredits(userId, grantType, credits, sourceId = null, expiresAt = null, metadata = null) {
  if (!isConfigured()) {
    console.warn("[shadow-ledger] shadowGrantCredits: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return null;
  }
  try {
    const res = await fetch(restUrl("credit_grants"), {
      method: "POST",
      headers: headers({ "Prefer": "return=representation" }),
      body: JSON.stringify({
        user_id:    userId,
        grant_type: grantType,
        credits,
        source_id:  sourceId  ?? undefined,
        expires_at: expiresAt ?? undefined,
        metadata:   metadata  ?? undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logShadowError("shadowGrantCredits", new Error(`HTTP ${res.status}: ${detail}`));
      return null;
    }
    const rows = await res.json().catch(() => []);
    return rows?.[0]?.id ?? null;
  } catch (err) {
    logShadowError("shadowGrantCredits", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// shadowChargeGeneration
//
// Inserts one row into generation_charges with status='success'.
// Returns the inserted charge id so shadowAllocateCharge can reference it.
// The caller must NOT await this — chain allocation inside the same async block:
//
//   setImmediate(() => {
//     creditLedger.shadowChargeGeneration(...)
//       .then(chargeId => chargeId && creditLedger.shadowAllocateCharge(userId, chargeId, 10))
//       .catch(() => {});
//   });
//
// @param {string}      userId
// @param {string}      route           — e.g. '/generate-logo'
// @param {number}      creditsCharged  — default 10 (CREDIT_MULTIPLIER)
// @param {string|null} requestId       — backend request ID for log correlation
// @param {string|null} brandName
// @param {object|null} metadata
// @returns {Promise<string|null>}  — inserted charge id, or null on error
// ---------------------------------------------------------------------------
async function shadowChargeGeneration(userId, route, creditsCharged = 10, requestId = null, brandName = null, metadata = null) {
  if (!isConfigured()) {
    console.warn("[shadow-ledger] shadowChargeGeneration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return null;
  }
  try {
    const res = await fetch(restUrl("generation_charges"), {
      method: "POST",
      headers: headers({ "Prefer": "return=representation" }),
      body: JSON.stringify({
        user_id:         userId,
        route,
        credits_charged: creditsCharged,
        status:          "success",
        request_id:      requestId  ?? undefined,
        brand_name:      brandName  ?? undefined,
        metadata:        metadata   ?? undefined,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logShadowError("shadowChargeGeneration", new Error(`HTTP ${res.status}: ${detail}`));
      return null;
    }
    const rows = await res.json().catch(() => []);
    return rows?.[0]?.id ?? null;
  } catch (err) {
    logShadowError("shadowChargeGeneration", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// shadowAllocateCharge
//
// Maps a charge across one or more credit_grants rows using spend-order logic:
//   1. Expiring grants (monthly_pro) first — ordered by expires_at ASC
//   2. Non-expiring grants — ordered by created_at ASC (FIFO)
//
// Computes available credits per grant as:
//   grant.credits - SUM(existing allocations for that grant)
//
// In shadow mode, allocation mismatches (e.g. missing free_signup backfill)
// are logged and swallowed — they do not affect live billing.
//
// @param {string} userId
// @param {string} chargeId      — generation_charges.id from shadowChargeGeneration
// @param {number} totalCredits  — total credits to allocate
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function shadowAllocateCharge(userId, chargeId, totalCredits) {
  if (!isConfigured()) {
    console.warn("[shadow-ledger] shadowAllocateCharge: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return;
  }
  try {
    // 1. Fetch all active grants for this user, spend order:
    //    expiring first (expires_at ASC NULLS LAST), then FIFO (created_at ASC).
    const grantsRes = await fetch(
      restUrl("credit_grants") +
        `?user_id=eq.${encodeURIComponent(userId)}` +
        `&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(new Date().toISOString())})` +
        `&order=expires_at.asc.nullslast,created_at.asc` +
        `&select=id,credits,expires_at,created_at,grant_type`,
      { method: "GET", headers: headers() }
    );
    if (!grantsRes.ok) {
      const detail = await grantsRes.text().catch(() => "");
      logShadowError("shadowAllocateCharge[fetch grants]", new Error(`HTTP ${grantsRes.status}: ${detail}`));
      return;
    }
    const grants = await grantsRes.json().catch(() => []);
    if (!Array.isArray(grants) || grants.length === 0) {
      console.warn("[shadow-ledger] shadowAllocateCharge: no active grants found for user — charge not allocated (backfill may be needed)");
      return;
    }

    // 2. Fetch existing allocations for these grants to compute available credits.
    const grantIds = grants.map((g) => g.id);
    const allocsRes = await fetch(
      restUrl("generation_charge_allocations") +
        `?grant_id=in.(${grantIds.map(encodeURIComponent).join(",")})` +
        `&select=grant_id,credits_used`,
      { method: "GET", headers: headers() }
    );
    const allocs = allocsRes.ok ? await allocsRes.json().catch(() => []) : [];

    // Sum allocated credits per grant.
    const allocatedByGrant = {};
    if (Array.isArray(allocs)) {
      for (const a of allocs) {
        allocatedByGrant[a.grant_id] = (allocatedByGrant[a.grant_id] || 0) + a.credits_used;
      }
    }

    // 3. Walk grants in spend order, allocate greedily.
    let remaining = totalCredits;
    for (const grant of grants) {
      if (remaining <= 0) break;
      const available = grant.credits - (allocatedByGrant[grant.id] || 0);
      if (available <= 0) continue;
      const use = Math.min(available, remaining);

      const insRes = await fetch(restUrl("generation_charge_allocations"), {
        method:  "POST",
        headers: headers({ "Prefer": "return=minimal" }),
        body:    JSON.stringify({ charge_id: chargeId, grant_id: grant.id, credits_used: use }),
      });
      if (!insRes.ok) {
        const detail = await insRes.text().catch(() => "");
        logShadowError("shadowAllocateCharge[insert allocation]", new Error(`HTTP ${insRes.status}: ${detail}`));
        return;
      }
      remaining -= use;
    }

    if (remaining > 0) {
      console.warn(`[shadow-ledger] shadowAllocateCharge: ${remaining} credits unallocated for chargeId=${chargeId} — insufficient shadow grants (normal before backfill)`);
    }
  } catch (err) {
    logShadowError("shadowAllocateCharge", err);
  }
}

// ---------------------------------------------------------------------------
// shadowRefundGeneration
//
// Called after a confirmed generation failure.
// 1. Updates the generation_charges row to status='refunded'.
// 2. Issues a 'failed_generation_refund' credit grant for the same amount.
//
// Prerequisite: originalChargeId must exist in generation_charges.
// If the row is not found, logs and returns without issuing a phantom grant.
//
// @param {string} userId
// @param {string} originalChargeId  — generation_charges.id of the failed charge
// @param {number} creditsToRefund   — must match the original credits_charged
// @returns {Promise<void>}
// ---------------------------------------------------------------------------
async function shadowRefundGeneration(userId, originalChargeId, creditsToRefund = 10) {
  if (!isConfigured()) {
    console.warn("[shadow-ledger] shadowRefundGeneration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return;
  }
  try {
    // 1. Verify the charge row exists before issuing a refund grant.
    const checkRes = await fetch(
      restUrl("generation_charges") +
        `?id=eq.${encodeURIComponent(originalChargeId)}&user_id=eq.${encodeURIComponent(userId)}&select=id,credits_charged`,
      { method: "GET", headers: headers() }
    );
    if (!checkRes.ok) {
      const detail = await checkRes.text().catch(() => "");
      logShadowError("shadowRefundGeneration[verify charge]", new Error(`HTTP ${checkRes.status}: ${detail}`));
      return;
    }
    const rows = await checkRes.json().catch(() => []);
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn(`[shadow-ledger] shadowRefundGeneration: charge ${originalChargeId} not found — no refund grant issued`);
      return;
    }

    // 2. Update the charge status to 'refunded'.
    const patchRes = await fetch(
      restUrl("generation_charges") +
        `?id=eq.${encodeURIComponent(originalChargeId)}`,
      {
        method:  "PATCH",
        headers: headers({ "Prefer": "return=minimal" }),
        body:    JSON.stringify({ status: "refunded" }),
      }
    );
    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => "");
      logShadowError("shadowRefundGeneration[patch status]", new Error(`HTTP ${patchRes.status}: ${detail}`));
      return;
    }

    // 3. Issue the refund grant — source_id links it back to the original charge.
    await shadowGrantCredits(
      userId,
      "failed_generation_refund",
      creditsToRefund,
      originalChargeId,
      null,
      { refunded_charge_id: originalChargeId }
    );
  } catch (err) {
    logShadowError("shadowRefundGeneration", err);
  }
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  shadowLogWebhookEvent,
  shadowGrantCredits,
  shadowChargeGeneration,
  shadowAllocateCharge,
  shadowRefundGeneration,
};
