'use strict';

/**
 * Lightweight manual test harness for the mailverify engine.
 *
 * This is NOT a unit-test framework run — it simply pushes a set of sample
 * emails through verify() and prints the results so you can eyeball each case.
 * Run with: `npm test`  (or `node test/verify.test.js`).
 *
 * Note: DNS-dependent cases hit the real network, so results for those depend
 * on connectivity. The syntax/disposable/role checks are fully offline.
 */

const { verify } = require('../src/engine');

// Each sample documents what we expect to see.
const SAMPLES = [
  { email: 'john.doe@gmail.com', note: 'valid syntax, free provider, real MX' },
  { email: 'support@example.com', note: 'role-based local part (flag only)' },
  { email: 'hello@mailinator.com', note: 'disposable domain' },
  { email: 'not-an-email', note: 'bad syntax: no @ / no domain' },
  { email: 'double@@example.com', note: 'bad syntax: double @' },
  { email: 'spaces in@example.com', note: 'bad syntax: whitespace' },
  { email: 'missing@tld', note: 'bad syntax: no TLD' },
  { email: 'someone@nonexistent-domain-xyz-12345.com', note: 'no MX record' },
  { email: 'info@github.com', note: 'role + real MX' },
];

/**
 * Pad a string to a fixed width for tidy console columns.
 */
function pad(str, width) {
  str = String(str);
  return str.length >= width ? str : str + ' '.repeat(width - str.length);
}

async function run() {
  console.log('mailverify — sample run\n' + '='.repeat(60));

  for (const sample of SAMPLES) {
    const result = await verify(sample.email);
    console.log('\n' + '-'.repeat(60));
    console.log(`input : ${sample.email}`);
    console.log(`expect: ${sample.note}`);
    console.log(
      `result: ${pad(result.status, 11)} ` +
        `sub=${pad(result.sub_status, 20)} score=${result.score}`
    );
    console.log(
      `flags : role=${result.role} disposable=${result.disposable} ` +
        `free=${result.free_provider} mx=${result.mx_found}`
    );
    if (result.mx_records.length > 0) {
      const top = result.mx_records
        .slice(0, 3)
        .map((r) => `${r.exchange}(${r.priority})`)
        .join(', ');
      console.log(`mx    : ${top}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Done.');
}

run().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
