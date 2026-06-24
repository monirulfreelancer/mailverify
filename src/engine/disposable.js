'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Disposable / temporary email domain detection.
 *
 * The domain list is loaded once at module load time into an in-memory Set so
 * lookups are O(1). To refresh the list at runtime, call reload().
 */

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'disposable-domains.txt');

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
let disposableSet = new Set(readListFile(DATA_FILE));

/**
 * Reload the disposable list from disk (useful after updating the text file).
 * @returns {number} the number of domains loaded
 */
function reload() {
  disposableSet = new Set(readListFile(DATA_FILE));
  return disposableSet.size;
}

/**
 * Is the given domain a known disposable provider? O(1) lookup.
 * @param {string} domain
 * @returns {boolean}
 */
function isDisposable(domain) {
  if (!domain) return false;
  return disposableSet.has(domain.trim().toLowerCase());
}

module.exports = { isDisposable, reload, get size() { return disposableSet.size; } };
