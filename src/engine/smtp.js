'use strict';

const net = require('net');
const crypto = require('crypto');

/**
 * Low-level SMTP probe + catch-all detection.
 *
 * We open a raw TCP connection to the recipient's MX host on port 25 and walk
 * through the SMTP handshake far enough to ask the server whether it will accept
 * mail for a given address (the RCPT TO step). We then send QUIT and close.
 *
 * We DELIBERATELY never issue a DATA command, so no actual mail is ever sent —
 * this is purely a deliverability probe.
 *
 * No third-party mail library is used; we need byte-level control over the
 * conversation and reply-code parsing.
 */

// --- Configuration (env-overridable, with sane defaults) -------------------

const HELO_DOMAIN = process.env.SMTP_HELO_DOMAIN || 'verify.mailverify.app';
const FROM_ADDRESS = process.env.SMTP_FROM_ADDRESS || 'probe@verify.mailverify.app';
const TIMEOUT_MS = parseInt(process.env.SMTP_TIMEOUT_MS || '10000', 10);
const SMTP_PORT = 25;

/**
 * Map an RCPT reply code to a normalized verdict.
 *
 * @param {number} code
 * @returns {{ smtp: 'valid'|'invalid'|'unknown', retryable: boolean }}
 */
function classifyRcptCode(code) {
  if (code === 250 || code === 251) {
    return { smtp: 'valid', retryable: false };
  }
  if (code === 550 || code === 551 || code === 553) {
    return { smtp: 'invalid', retryable: false };
  }
  if (code === 450 || code === 451 || code === 452) {
    // Greylisting / temporary local error — worth retrying later.
    return { smtp: 'unknown', retryable: true };
  }
  // Any other 4xx (transient) — treat as retryable unknown.
  if (code >= 400 && code < 500) {
    return { smtp: 'unknown', retryable: true };
  }
  // Unexpected 5xx that isn't a known "no such user" code, or anything else:
  // we can't make a confident call.
  return { smtp: 'unknown', retryable: false };
}

/**
 * Parse the leading 3-digit reply code from an SMTP response buffer.
 *
 * SMTP multiline replies look like:
 *   250-server says hello
 *   250-PIPELINING
 *   250 8BITMIME            <-- final line uses a space after the code
 * We only act once a "final" line (code followed by a space) has arrived.
 *
 * @param {string} buffer accumulated text from the socket
 * @returns {number|null} the numeric code if a complete reply is present
 */
function parseFinalReplyCode(buffer) {
  const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return null;

  // Walk from the end to find the last line that is a "final" reply line
  // (3 digits followed by a space, not a hyphen).
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = /^(\d{3})([ ])/.exec(lines[i]);
    if (m) {
      return parseInt(m[1], 10);
    }
  }
  return null;
}

/**
 * Run a single SMTP RCPT probe against an MX host for a target address.
 *
 * Conversation:
 *   <connect> -> 220 -> EHLO -> 250 -> MAIL FROM -> 250 -> RCPT TO -> <code> -> QUIT
 *
 * The promise ALWAYS resolves (never rejects) with a normalized verdict so the
 * caller never has to wrap it in try/catch.
 *
 * @param {string} mxHost     the mail-exchange hostname to connect to
 * @param {string} targetEmail the full address to probe (RCPT TO)
 * @returns {Promise<{ smtp: 'valid'|'invalid'|'unknown', retryable: boolean, code: number|null, reason: string }>}
 */
function probeRcpt(mxHost, targetEmail) {
  return new Promise((resolve) => {
    let settled = false;
    let buffer = '';

    // Conversation state machine.
    // States: 'greeting' -> 'ehlo' -> 'mailfrom' -> 'rcpt' -> 'quit'
    let state = 'greeting';

    const socket = new net.Socket();

    // Single resolution point so we only ever resolve once and always clean up.
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {
        /* ignore */
      }
      resolve(result);
    };

    const send = (line) => {
      try {
        socket.write(line + '\r\n');
      } catch (_) {
        finish({ smtp: 'unknown', retryable: true, code: null, reason: 'write_failed' });
      }
    };

    socket.setTimeout(TIMEOUT_MS);

    socket.on('timeout', () => {
      finish({ smtp: 'unknown', retryable: true, code: null, reason: 'timeout' });
    });

    socket.on('error', (err) => {
      // ECONNREFUSED, EHOSTUNREACH, ETIMEDOUT, etc. — all transient/unknown.
      finish({ smtp: 'unknown', retryable: true, code: null, reason: err.code || 'socket_error' });
    });

    socket.on('close', () => {
      // Server hung up before we reached a verdict.
      finish({ smtp: 'unknown', retryable: true, code: null, reason: 'connection_closed' });
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const code = parseFinalReplyCode(buffer);
      if (code === null) return; // wait for a complete (final) reply line

      // Each time we fully consume a reply, reset the buffer for the next step.
      switch (state) {
        case 'greeting':
          if (code === 220) {
            buffer = '';
            state = 'ehlo';
            send('EHLO ' + HELO_DOMAIN);
          } else {
            finish({ smtp: 'unknown', retryable: true, code, reason: 'bad_greeting' });
          }
          break;

        case 'ehlo':
          if (code === 250) {
            buffer = '';
            state = 'mailfrom';
            send('MAIL FROM:<' + FROM_ADDRESS + '>');
          } else {
            finish({ smtp: 'unknown', retryable: true, code, reason: 'ehlo_rejected' });
          }
          break;

        case 'mailfrom':
          if (code === 250) {
            buffer = '';
            state = 'rcpt';
            send('RCPT TO:<' + targetEmail + '>');
          } else {
            finish({ smtp: 'unknown', retryable: true, code, reason: 'mailfrom_rejected' });
          }
          break;

        case 'rcpt': {
          // This is the answer we care about.
          const verdict = classifyRcptCode(code);
          state = 'quit';
          send('QUIT');
          finish({ ...verdict, code, reason: 'rcpt_' + code });
          break;
        }

        default:
          // Anything after we've decided is ignored.
          break;
      }
    });

    // Kick off the connection.
    try {
      socket.connect(SMTP_PORT, mxHost);
    } catch (err) {
      finish({ smtp: 'unknown', retryable: true, code: null, reason: 'connect_throw' });
    }
  });
}

/**
 * Probe whether a specific mailbox exists.
 *
 * @param {string} mxHost
 * @param {string} targetEmail
 * @returns {Promise<{ smtp: 'valid'|'invalid'|'unknown', retryable: boolean, code: number|null, reason: string }>}
 */
async function checkMailbox(mxHost, targetEmail) {
  if (!mxHost || !targetEmail) {
    return { smtp: 'unknown', retryable: true, code: null, reason: 'missing_args' };
  }
  return probeRcpt(mxHost, targetEmail);
}

/**
 * Detect a catch-all (accept-all) domain.
 *
 * We RCPT TO a random address that almost certainly does not exist. If the
 * server still answers 250, it accepts mail for anything → catch-all.
 *
 * @param {string} mxHost
 * @param {string} domain
 * @returns {Promise<'true'|'false'|'unknown'>} string tri-state
 */
async function checkCatchAll(mxHost, domain) {
  if (!mxHost || !domain) return 'unknown';

  // Random local part that no human would ever register.
  const rand = crypto.randomBytes(8).toString('hex');
  const bogusAddress = `no-reply-${rand}@${domain}`;

  const result = await probeRcpt(mxHost, bogusAddress);

  if (result.smtp === 'valid') {
    // Server accepted an address that can't exist → catch-all.
    return 'true';
  }
  if (result.smtp === 'invalid') {
    // Server correctly rejects unknown users → not catch-all.
    return 'false';
  }
  // Timeout / greylist / transient — we genuinely can't tell.
  return 'unknown';
}

module.exports = {
  checkMailbox,
  checkCatchAll,
  // Exposed for testing / reuse.
  classifyRcptCode,
  parseFinalReplyCode,
  config: { HELO_DOMAIN, FROM_ADDRESS, TIMEOUT_MS, SMTP_PORT },
};
