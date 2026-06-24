'use strict';

const dns = require('dns').promises;

/**
 * DNS lookups for mail deliverability.
 *
 * We first look for MX records (the canonical way a domain accepts mail). If a
 * domain has no MX records we fall back to an A/AAAA record: per RFC 5321 a host
 * with an address record but no MX is treated as if it had an MX pointing at
 * itself (an "implicit MX").
 */

/**
 * Resolve mail-exchange information for a domain.
 *
 * @param {string} domain
 * @returns {Promise<{
 *   mxFound: boolean,
 *   records: Array<{ exchange: string, priority: number }>,
 *   fallbackA: boolean,
 *   reason: string
 * }>}
 */
async function resolveMail(domain) {
  if (!domain) {
    return { mxFound: false, records: [], fallbackA: false, reason: 'no_domain' };
  }

  // --- 1. Try MX records ---
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length > 0) {
      // Sort by priority ascending (lower priority value = preferred host).
      const records = mx
        .map((r) => ({ exchange: r.exchange, priority: r.priority }))
        .sort((a, b) => a.priority - b.priority);
      return { mxFound: true, records, fallbackA: false, reason: 'mx_found' };
    }
  } catch (err) {
    // ENOTFOUND / ENODATA here just means "no MX" — we still try A below.
    // Anything else (e.g. transient SERVFAIL) is also allowed to fall through.
  }

  // --- 2. Fall back to A / AAAA (implicit MX) ---
  try {
    const aRecords = await dns.resolve4(domain);
    if (aRecords && aRecords.length > 0) {
      return {
        mxFound: true,
        records: [{ exchange: domain, priority: 0 }],
        fallbackA: true,
        reason: 'a_record_fallback',
      };
    }
  } catch (err) {
    // ignore — try AAAA next
  }

  try {
    const aaaaRecords = await dns.resolve6(domain);
    if (aaaaRecords && aaaaRecords.length > 0) {
      return {
        mxFound: true,
        records: [{ exchange: domain, priority: 0 }],
        fallbackA: true,
        reason: 'aaaa_record_fallback',
      };
    }
  } catch (err) {
    // ignore — domain truly cannot receive mail
  }

  // --- 3. Nothing found: domain cannot receive mail ---
  return { mxFound: false, records: [], fallbackA: false, reason: 'no_mx_record' };
}

module.exports = { resolveMail };
