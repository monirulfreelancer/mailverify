'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Role-based local-part detection.
 *
 * A "role" address (info@, support@, sales@ ...) belongs to a function or team
 * rather than an individual. This is a *flag*, not a failure — role addresses
 * are still deliverable. The prefix list is loaded once into a Set for O(1)
 * lookups.
 */

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'role-prefixes.txt');

/**
 * Read a newline-delimited data file into a lowercased, trimmed array,
 * skipping blank lines and '#' comments.
 *
 * @param {string} filePath
 * @returns {string[]}
 */
function readListFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

// Load once at startup.
let roleSet = new Set(readListFile(DATA_FILE));

/**
 * Reload the role-prefix list from disk.
 * @returns {number} the number of prefixes loaded
 */
function reload() {
  roleSet = new Set(readListFile(DATA_FILE));
  return roleSet.size;
}

/**
 * Does the local part match a known role prefix?
 *
 * The comparison is on the full local part, lowercased. Tagged addresses such
 * as "support+ticket@..." are normalised by stripping a "+tag" suffix so the
 * base prefix still matches.
 *
 * @param {string} localPart
 * @returns {boolean}
 */
function isRole(localPart) {
  if (!localPart) return false;
  const normalized = localPart.trim().toLowerCase().split('+')[0];
  return roleSet.has(normalized);
}

module.exports = { isRole, reload, get size() { return roleSet.size; } };
