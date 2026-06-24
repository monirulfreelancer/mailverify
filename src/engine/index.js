'use strict';

const { checkSyntax } = require('./syntax');
const disposable = require('./disposable');
const role = require('./role');
const { resolveMail } = require('./dns');
const smtp = require('./smtp');

/**
 * mailverify core engine.
 *
 * Pipeline (cheapest checks first, short-circuit on definite failures):
 *   1. Syntax check   — reject obvious garbage early.
 *   2. Disposable     — O(1) Set lookup; if disposable, definite "disposable".
 *   3. Role           — flag-only, never a failure.
 *   4. DNS / MX       — must be able to receive mail, else "invalid".
 *   5. SMTP probe     — ask the MX host whether the mailbox exists (no mail sent),
 *                       plus catch-all detection. Skippable via { skipSmtp: true }.
 *
 * When SMTP is skipped (offline / Chunk-1 behavior), a fully-passing email tops
 * out at status "unknown" / sub_status "mx_ok_smtp_pending".
 */

// Common free webmail providers. A free address is perfectly valid; it's just a
// useful signal for downstream scoring/segmentation.
const FREE_PROVIDERS = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'aol.com',
]);

/**
 * Build the canonical result object so every return path has the same shape.
 * @param {object} overrides
 * @returns {object}
 */
function makeResult(overrides) {
  return Object.assign(
    {
      email: '',
      status: 'unknown',
      sub_status: '',
      role: false,
      disposable: false,
      free_provider: false,
      mx_found: false,
      mx_records: [],
      smtp_status: null, // raw smtp verdict: 'valid'|'invalid'|'unknown'|null (not probed)
      catch_all: false, // true if the domain accepts mail for any address
      score: 0,
    },
    overrides
  );
}

/**
 * Verify a single email address.
 *
 * @param {string} email
 * @param {object} [options]
 * @param {boolean} [options.skipSmtp=false] skip the SMTP probe + catch-all step
 *   (offline-safe; preserves Chunk-1 behavior).
 * @returns {Promise<{
 *   email: string,
 *   status: 'valid'|'invalid'|'disposable'|'unknown'|'accept_all',
 *   sub_status: string,
 *   role: boolean,
 *   disposable: boolean,
 *   free_provider: boolean,
 *   mx_found: boolean,
 *   mx_records: Array,
 *   smtp_status: 'valid'|'invalid'|'unknown'|null,
 *   catch_all: boolean,
 *   score: number
 * }>}
 */
async function verify(email, options = {}) {
  const { skipSmtp = false } = options;
  const normalized = typeof email === 'string' ? email.trim() : email;

  // --- 1. Syntax ---------------------------------------------------------
  const syntax = checkSyntax(normalized);
  if (!syntax.valid) {
    return makeResult({
      email: normalized || '',
      status: 'invalid',
      sub_status: 'bad_syntax',
      score: 0,
    });
  }

  const { local, domain } = syntax;
  const domainLower = domain.toLowerCase();
  const freeProvider = FREE_PROVIDERS.has(domainLower);
  const isRoleAddress = role.isRole(local);

  // --- 2. Disposable -----------------------------------------------------
  if (disposable.isDisposable(domainLower)) {
    return makeResult({
      email: normalized,
      status: 'disposable',
      sub_status: 'disposable_domain',
      role: isRoleAddress,
      disposable: true,
      free_provider: freeProvider,
      // We don't bother with DNS for disposable domains — verdict is definite.
      score: 10,
    });
  }

  // --- 3. Role (flag only, keep going) -----------------------------------
  // (already computed above as isRoleAddress)

  // --- 4. DNS / MX -------------------------------------------------------
  const mail = await resolveMail(domainLower);
  if (!mail.mxFound) {
    return makeResult({
      email: normalized,
      status: 'invalid',
      sub_status: 'no_mx_record',
      role: isRoleAddress,
      disposable: false,
      free_provider: freeProvider,
      mx_found: false,
      mx_records: [],
      score: 0,
    });
  }

  // Preferred MX host (records are already sorted by priority ascending).
  const mxHost = mail.records[0].exchange;

  // --- 5. SMTP probe + catch-all -----------------------------------------
  // Skippable so Chunk-1 offline behavior is preserved for testing.
  if (skipSmtp) {
    let score = 80;
    if (isRoleAddress) score -= 10; // role mailboxes are lower-value leads
    if (mail.fallbackA) score -= 5; // A-record fallback is weaker than real MX

    return makeResult({
      email: normalized,
      status: 'unknown',
      sub_status: 'mx_ok_smtp_pending',
      role: isRoleAddress,
      disposable: false,
      free_provider: freeProvider,
      mx_found: true,
      mx_records: mail.records,
      smtp_status: null,
      catch_all: false,
      score,
    });
  }

  // TODO(bulk-mode): For verifying many addresses on the same domain we should
  // open ONE SMTP session per domain and pipeline multiple RCPT TO commands
  // (plus a single catch-all probe) over it, rather than the two independent
  // connections we open here per address. That requires connection pooling /
  // reuse keyed by MX host and per-host rate limiting to avoid tripping
  // greylisting or anti-abuse throttles.
  const [mailboxResult, catchAllResult] = await Promise.all([
    smtp.checkMailbox(mxHost, normalized),
    smtp.checkCatchAll(mxHost, domainLower),
  ]);

  const catchAll = catchAllResult === 'true';
  const smtpStatus = mailboxResult.smtp; // 'valid' | 'invalid' | 'unknown'

  // --- Final status logic ------------------------------------------------
  let status;
  let subStatus;
  let score;

  if (catchAll) {
    // Domain accepts everything — we can't trust a per-mailbox answer.
    status = 'accept_all';
    subStatus = 'catch_all';
    score = 50;
  } else if (smtpStatus === 'valid') {
    status = 'valid';
    subStatus = 'smtp_confirmed';
    score = 95;
  } else if (smtpStatus === 'invalid') {
    status = 'invalid';
    subStatus = 'smtp_no_user';
    score = 0;
  } else {
    // smtpStatus === 'unknown' (timeout, greylist, blocked port 25, etc.)
    status = 'unknown';
    subStatus = 'smtp_unknown';
    score = 40;
  }

  // Minor adjustments for non-failing verdicts.
  if (score > 0 && isRoleAddress) score -= 10; // role mailboxes are lower value

  return makeResult({
    email: normalized,
    status,
    sub_status: subStatus,
    role: isRoleAddress,
    disposable: false,
    free_provider: freeProvider,
    mx_found: true,
    mx_records: mail.records,
    smtp_status: smtpStatus,
    catch_all: catchAll,
    score,
  });
}

module.exports = { verify, FREE_PROVIDERS };
