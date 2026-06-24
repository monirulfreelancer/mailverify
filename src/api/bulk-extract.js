'use strict';

const { parse } = require('csv-parse/sync');
const { checkSyntax } = require('../engine/syntax');

/**
 * Turn an uploaded .csv / .txt file into a clean list of email addresses.
 *
 * Handles three shapes transparently:
 *   1. CSV WITH a header row — finds the column named like email/e-mail/address
 *      (or, failing that, the first column whose values look like addresses).
 *   2. CSV / single-column list — one address per row.
 *   3. Plain-text list (.txt) — one address per line.
 *
 * The result is de-duplicated (case-insensitively) and syntax-filtered using the
 * SAME validator the engine uses, so the count we charge credits against only
 * includes addresses worth verifying.
 */

// A pragmatic "does this cell look like an email?" test, used to locate the
// email column and to pull addresses out of multi-column rows.
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Header names that denote the email column (normalized: lowercased, trimmed).
const EMAIL_HEADERS = new Set(['email', 'e-mail', 'e_mail', 'mail', 'address', 'email address', 'email_address']);

/**
 * Decide whether a parsed first row is a header (no cell looks like an email).
 * @param {string[]} row
 * @returns {boolean}
 */
function looksLikeHeader(row) {
  if (!row || row.length === 0) return false;
  const hasEmailCell = row.some((c) => EMAIL_LIKE.test(String(c).trim()));
  if (hasEmailCell) return false; // a real address in row 0 => it's data, not a header
  // Otherwise treat it as a header iff one of its cells names the email column,
  // or it's clearly non-email text in every cell.
  return true;
}

/**
 * Find the index of the email column from a header row, or -1 if none matches.
 * @param {string[]} header
 * @returns {number}
 */
function findEmailColumn(header) {
  for (let i = 0; i < header.length; i += 1) {
    const name = String(header[i]).trim().toLowerCase();
    if (EMAIL_HEADERS.has(name) || name.includes('email') || name.includes('e-mail')) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract addresses from a buffer.
 *
 * @param {Buffer} buffer       raw file contents
 * @param {string} [filename]   used only to prefer line-splitting for .txt
 * @returns {{ emails: string[], totalRaw: number, duplicates: number, invalid: number }}
 *   emails: clean, de-duplicated, syntactically valid addresses.
 */
function extractEmails(buffer, filename = '') {
  const text = buffer.toString('utf8').replace(/^﻿/, ''); // strip BOM
  const isTxt = /\.txt$/i.test(filename);

  /** @type {string[][]} */
  let rows;

  if (isTxt) {
    // Plain text: one entry per line. Still split on commas defensively in case
    // a "txt" file is really comma-separated.
    rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => (line.includes(',') ? line.split(',').map((c) => c.trim()) : [line]));
  } else {
    // CSV (or anything else): let csv-parse handle quoting/escaping. Ragged rows
    // are fine — we look up cells defensively below.
    rows = parse(text, {
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  }

  if (!rows || rows.length === 0) {
    return { emails: [], totalRaw: 0, duplicates: 0, invalid: 0 };
  }

  // Detect + consume a header row, and learn the email column if present.
  let emailCol = -1;
  if (looksLikeHeader(rows[0])) {
    emailCol = findEmailColumn(rows[0]);
    rows = rows.slice(1);
  }

  // Pull a candidate address out of each row.
  const candidates = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length === 0) continue;
    let value;
    if (emailCol >= 0 && row[emailCol] != null) {
      value = String(row[emailCol]).trim();
    } else if (row.length === 1) {
      value = String(row[0]).trim();
    } else {
      // Multi-column row without a known email column — grab the first cell that
      // looks like an address.
      const cell = row.find((c) => EMAIL_LIKE.test(String(c).trim()));
      value = cell != null ? String(cell).trim() : '';
    }
    if (value) candidates.push(value);
  }

  // De-duplicate (case-insensitively) and syntax-filter.
  const seen = new Set();
  const emails = [];
  let duplicates = 0;
  let invalid = 0;
  for (const raw of candidates) {
    const key = raw.toLowerCase();
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    if (!checkSyntax(raw).valid) {
      invalid += 1;
      continue;
    }
    emails.push(raw);
  }

  return { emails, totalRaw: candidates.length, duplicates, invalid };
}

module.exports = { extractEmails };
