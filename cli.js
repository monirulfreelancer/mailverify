#!/usr/bin/env node
'use strict';

/**
 * Command-line entry point for the mailverify engine.
 *
 * Usage:
 *   node cli.js someone@example.com
 *   node cli.js someone@example.com --no-smtp   (skip the SMTP probe / catch-all)
 *
 * Prints the verdict object as pretty JSON and exits 0 for valid/unknown/
 * accept_all, 1 for invalid/disposable (handy for scripting).
 */

const { verify } = require('./src/engine');

async function main() {
  const args = process.argv.slice(2);

  // Separate flags from the positional email argument.
  const skipSmtp = args.includes('--no-smtp');
  const email = args.find((a) => !a.startsWith('-'));

  if (!email) {
    console.error('Usage: node cli.js <email> [--no-smtp]');
    process.exit(2);
  }

  const result = await verify(email, { skipSmtp });
  console.log(JSON.stringify(result, null, 2));

  // Non-zero exit for definite-bad verdicts so it composes in shell pipelines.
  const bad = result.status === 'invalid' || result.status === 'disposable';
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error('mailverify error:', err.message);
  process.exit(3);
});
