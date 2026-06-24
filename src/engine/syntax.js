'use strict';

/**
 * Syntax / format validation for email addresses.
 *
 * This is intentionally the *cheapest* check in the pipeline and runs first.
 * It is an RFC 5322-flavoured pragmatic validator: it accepts the addresses
 * that real mail systems accept and rejects obvious garbage, rather than
 * implementing the full (rarely-used) RFC grammar.
 */

// Overall length limits (RFC 5321):
//   - local part: max 64 octets
//   - domain:     max 255 octets
//   - whole address is practically capped at 254 chars
const MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const MAX_DOMAIN_LENGTH = 255;

// Local part: dot-separated "atoms" of allowed characters.
// Allowed: letters, digits and a common set of special chars. Dots are allowed
// between atoms but not at the start/end and not doubled.
const LOCAL_ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+";
const LOCAL_PART_REGEX = new RegExp(`^${LOCAL_ATOM}(?:\\.${LOCAL_ATOM})*$`);

// A single DNS label: starts/ends alphanumeric, may contain hyphens inside,
// max 63 chars.
const LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
// Domain: one or more labels, ending in a TLD of at least two letters.
const DOMAIN_REGEX = new RegExp(`^(?:${LABEL}\\.)+[A-Za-z]{2,}$`);

/**
 * Validate the syntax of an email address.
 *
 * @param {string} email
 * @returns {{ valid: boolean, reason: string, local?: string, domain?: string }}
 */
function checkSyntax(email) {
  if (typeof email !== 'string') {
    return { valid: false, reason: 'not_a_string' };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: 'empty' };
  }

  if (trimmed.length > MAX_EMAIL_LENGTH) {
    return { valid: false, reason: 'too_long' };
  }

  // Whitespace anywhere is invalid (we already trimmed the ends).
  if (/\s/.test(trimmed)) {
    return { valid: false, reason: 'contains_whitespace' };
  }

  // Exactly one '@' splits local and domain. Catches "double @" and "no @".
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount === 0) {
    return { valid: false, reason: 'missing_at' };
  }
  if (atCount > 1) {
    return { valid: false, reason: 'multiple_at' };
  }

  const atIndex = trimmed.lastIndexOf('@');
  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  // --- Local part checks ---
  if (local.length === 0) {
    return { valid: false, reason: 'empty_local_part' };
  }
  if (local.length > MAX_LOCAL_LENGTH) {
    return { valid: false, reason: 'local_part_too_long' };
  }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { valid: false, reason: 'invalid_dot_in_local' };
  }
  if (!LOCAL_PART_REGEX.test(local)) {
    return { valid: false, reason: 'invalid_local_chars' };
  }

  // --- Domain checks ---
  if (domain.length === 0) {
    return { valid: false, reason: 'empty_domain' };
  }
  if (domain.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, reason: 'domain_too_long' };
  }
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return { valid: false, reason: 'invalid_dot_in_domain' };
  }
  // Must have a TLD (i.e. at least one dot) and valid label structure.
  if (!domain.includes('.')) {
    return { valid: false, reason: 'no_tld' };
  }
  if (!DOMAIN_REGEX.test(domain)) {
    return { valid: false, reason: 'invalid_domain' };
  }

  return { valid: true, reason: 'ok', local, domain };
}

module.exports = { checkSyntax };
