import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api';
import Spinner from '../components/Spinner';

/**
 * Buy Credits — manual payment flow.
 *
 * 1) Pick a package (prefills the request form's credits + amount).
 * 2) Send the exact amount to one of the payment methods (bKash / Rocket / bank).
 * 3) Submit the form with the transaction ID — POST /payments/requests.
 *
 * Below, "My payment requests" lists the user's own requests (GET
 * /payments/requests) with status badges. An admin/manager later approves the
 * request, which credits the account.
 */

const METHODS = [
  { value: 'bkash', label: 'bKash' },
  { value: 'rocket', label: 'Rocket' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank transfer' },
];

// Status -> CSS class for the badge (amber / green / red).
const PAYMENT_STATUS = {
  pending: { cls: 'pending', label: 'Pending' },
  approved: { cls: 'approved', label: 'Approved' },
  rejected: { cls: 'rejected', label: 'Rejected' },
};

/**
 * Per-method brand styling. Colors are tasteful approximations rendered as pure
 * CSS/SVG badges — NO trademarked logo artwork is used.
 */
const BRAND = {
  bkash: { name: 'bKash', tag: 'Send Money', color: '#E2136E', soft: '#fdecf4', icon: 'mobile' },
  rocket: { name: 'Rocket', tag: 'Send Money', color: '#8C3494', soft: '#f5edf8', icon: 'mobile' },
  nagad: { name: 'Nagad', tag: 'Send Money', color: '#EE7325', soft: '#fdf0e7', icon: 'mobile' },
  bank: { name: 'Bank Transfer', tag: 'Direct deposit', color: '#1e40af', soft: '#eaf0fb', icon: 'bank' },
};

// Soft accent colors cycled across the package cards (decorative only).
const PKG_ACCENTS = ['#10b981', '#6366f1', '#8b5cf6', '#f59e0b'];

function PaymentBadge({ status }) {
  const key = asText(status);
  const s = PAYMENT_STATUS[key] || { cls: 'unknown', label: key || 'Unknown' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(amount, currency) {
  const n = Number(amount);
  const value = Number.isNaN(n) ? amount : n.toLocaleString();
  return currency ? `${currency} ${value}` : `${value}`;
}

function formatNum(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (Number.isNaN(num)) return '—';
  return num.toLocaleString();
}

/**
 * Coerce a value to something safe to render as a React child.
 * Strings/numbers/booleans pass through (as strings); objects, arrays, null and
 * undefined collapse to '' so we NEVER hand React a raw object child.
 */
function asText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

/**
 * Bank details may arrive as a plain string OR as a structured object. These are
 * the fields we know how to label, each with a few tolerated key spellings.
 */
const BANK_FIELDS = [
  { label: 'Bank name', keys: ['bank_name', 'bankName', 'name'] },
  { label: 'Address', keys: ['address', 'bankAddress', 'bank_address'] },
  { label: 'SWIFT', keys: ['swift', 'swiftCode', 'swift_code', 'bic'] },
  { label: 'Routing (ABA)', keys: ['routing', 'routingNumber', 'routing_number', 'aba'] },
  { label: 'Account number', keys: ['account_number', 'accountNumber', 'account', 'acct'] },
  { label: 'Account type', keys: ['account_type', 'accountType', 'type'] },
  { label: 'Beneficiary', keys: ['beneficiary', 'beneficiaryName', 'beneficiary_name', 'holder'] },
];

function firstField(obj, keys) {
  for (const k of keys) {
    const val = asText(obj?.[k]);
    if (val) return val;
  }
  return '';
}

/**
 * A method's number may arrive as a plain string ("+880…") OR nested in an
 * object ({ number: "+880…" }). Pull out a renderable phone number from either.
 */
function methodNumber(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return firstField(v, ['number', 'msisdn', 'phone', 'account']);
  return '';
}

// The sender_info field means different things per method.
function senderLabel(method) {
  if (method === 'bank') return 'Bank reference / sender name';
  if (method === 'rocket') return 'Your Rocket number';
  if (method === 'nagad') return 'Your Nagad number';
  if (method === 'bkash') return 'Your bKash number';
  return 'Your account / sender info';
}

/* Which package to flag as "Most popular": prefer Pro, then Basic, else 2nd. */
function popularPackageId(packages) {
  if (!Array.isArray(packages) || packages.length === 0) return null;
  const byName = (sub) =>
    packages.find((p) => asText(p.name).toLowerCase().includes(sub));
  const pick = byName('pro') || byName('basic') || packages[1] || null;
  return pick ? pick.id : null;
}

/* Shared copy-to-clipboard hook for the branded method cards. */
function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      /* clipboard unavailable — ignore */
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  }, []);
  return [copied, copy];
}

/* -------------------------------------------------------------------------- */
/* Branded SVG glyphs (no trademarked logos — generic wallet / bank shapes)    */
/* -------------------------------------------------------------------------- */

function MethodGlyph({ kind }) {
  if (kind === 'bank') {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 3 8h18L12 3Z" fill="currentColor" />
        <path d="M5 10v7M9 10v7M15 10v7M19 10v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M3 20h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  // Generic mobile-wallet glyph for mobile financial services.
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M10 18.5h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M9 7h6M9 10h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Branded mobile-money method card                                           */
/* -------------------------------------------------------------------------- */

function BrandMethodCard({ brand, value }) {
  const [copied, copy] = useCopy();
  return (
    <div className="brand-method" style={{ '--brand': brand.color, '--brand-soft': brand.soft }}>
      <div className="brand-method-top">
        <span className="brand-badge">
          <MethodGlyph kind={brand.icon} />
        </span>
        <div>
          <div className="brand-method-name">
            {brand.name} <span className="brand-method-tag">{brand.tag}</span>
          </div>
        </div>
      </div>
      <div className="brand-method-number mono">{value || '—'}</div>
      {value && (
        <button
          type="button"
          className={`brand-copy${copied ? ' copied' : ''}`}
          onClick={() => copy(value)}
        >
          {copied ? '✓ Copied' : 'Copy number'}
        </button>
      )}
    </div>
  );
}

/**
 * Bank transfer instructions, styled as a wide branded card. `bank` may be a
 * string (single value) or a structured object (labeled fields). Anything else
 * renders nothing instead of crashing.
 */
function BankDetails({ bank }) {
  const [copied, copy] = useCopy();
  const brand = BRAND.bank;
  const asString = asText(bank);

  let lines = [];
  let copyText = '';
  let copyLabel = 'Copy';

  if (asString) {
    lines = [{ label: 'Details', value: asString }];
    copyText = asString;
  } else if (bank && typeof bank === 'object') {
    lines = BANK_FIELDS
      .map((f) => ({ label: f.label, value: firstField(bank, f.keys) }))
      .filter((line) => line.value);
    if (lines.length === 0) return null;
    const accountNumber = firstField(bank, ['account_number', 'accountNumber', 'account', 'acct']);
    copyText = accountNumber || lines.map((l) => `${l.label}: ${l.value}`).join('\n');
    copyLabel = accountNumber ? 'Copy account #' : 'Copy details';
  } else {
    return null;
  }

  return (
    <div
      className="brand-method brand-method-bank"
      style={{ '--brand': brand.color, '--brand-soft': brand.soft }}
    >
      <div className="brand-method-top">
        <span className="brand-badge">
          <MethodGlyph kind={brand.icon} />
        </span>
        <div>
          <div className="brand-method-name">
            {brand.name} <span className="brand-method-tag">{brand.tag}</span>
          </div>
        </div>
      </div>

      <div className="brand-bank-grid">
        {lines.map((line) => (
          <div className="brand-bank-line" key={line.label}>
            <span className="brand-bank-key">{line.label}</span>
            <span className="brand-bank-val mono">{line.value}</span>
          </div>
        ))}
      </div>

      {copyText && (
        <button
          type="button"
          className={`brand-copy${copied ? ' copied' : ''}`}
          onClick={() => copy(copyText)}
        >
          {copied ? '✓ Copied' : copyLabel}
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function BuyCredits() {
  const { token } = useAuth();

  const [packages, setPackages] = useState([]);
  const [methods, setMethods] = useState(null);
  const [loadingTop, setLoadingTop] = useState(true);
  const [topError, setTopError] = useState('');

  const [selectedId, setSelectedId] = useState(null);

  // Request form state.
  const [method, setMethod] = useState('bkash');
  const [amount, setAmount] = useState('');
  const [credits, setCredits] = useState('');
  const [senderInfo, setSenderInfo] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [note, setNote] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  const [requests, setRequests] = useState([]);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [reqError, setReqError] = useState('');

  // Load packages + methods together.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingTop(true);
      setTopError('');
      try {
        const [pkgs, mtds] = await Promise.all([
          api.paymentsGetPackages(token),
          api.paymentsGetMethods(token),
        ]);
        if (cancelled) return;
        const pkgList = Array.isArray(pkgs) ? pkgs : pkgs?.packages || [];
        setPackages(Array.isArray(pkgList) ? pkgList : []);
        // The real payload is flat: { methods: ["bkash",…], bkash: {...}, … }.
        // `methods` there is an ARRAY of names, NOT the details object — only
        // unwrap it when it's a plain object wrapper, never when it's an array.
        const m =
          mtds &&
          typeof mtds.methods === 'object' &&
          mtds.methods !== null &&
          !Array.isArray(mtds.methods)
            ? mtds.methods
            : mtds;
        setMethods(m && typeof m === 'object' ? m : null);
      } catch (err) {
        if (!cancelled) setTopError(err instanceof ApiError ? err.message : 'Could not load payment options.');
      } finally {
        if (!cancelled) setLoadingTop(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadRequests = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoadingReqs(true);
      try {
        const data = await api.paymentsListMyRequests(token);
        const list = Array.isArray(data) ? data : data?.requests;
        setRequests(Array.isArray(list) ? list : []);
        setReqError('');
      } catch (err) {
        if (!quiet) setReqError(err instanceof ApiError ? err.message : 'Could not load your requests.');
      } finally {
        if (!quiet) setLoadingReqs(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  function selectPackage(pkg) {
    setSelectedId(pkg.id);
    setAmount(String(pkg.price_amount ?? ''));
    setCredits(String(pkg.credits ?? ''));
    setSuccess('');
    setFormError('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;

    const amountNum = Number(amount);
    const creditsNum = Number(credits);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setFormError('Enter a valid amount.');
      return;
    }
    if (!credits || Number.isNaN(creditsNum) || creditsNum <= 0) {
      setFormError('Enter a valid number of credits.');
      return;
    }
    if (!senderInfo.trim()) {
      setFormError(`Please provide your ${senderLabel(method).toLowerCase()}.`);
      return;
    }
    if (!transactionId.trim()) {
      setFormError('Please enter the transaction ID (TrxID).');
      return;
    }

    setSubmitting(true);
    setFormError('');
    setSuccess('');
    try {
      const body = {
        method,
        amount: amountNum,
        credits: creditsNum,
        sender_info: senderInfo.trim(),
        transaction_id: transactionId.trim(),
      };
      if (selectedId != null) body.package_id = selectedId;
      if (note.trim()) body.note = note.trim();

      await api.paymentsCreateRequest(token, body);
      setSuccess("Request submitted! We'll verify and add your credits shortly.");
      // Reset the transaction-specific fields; keep package selection/amounts.
      setSenderInfo('');
      setTransactionId('');
      setNote('');
      loadRequests(true);
    } catch (err) {
      setFormError(submitErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function submitErrorMessage(err) {
    if (err instanceof ApiError) {
      if (err.status === 409 || err.status === 429) {
        return err.message || 'You already have a pending request. Please wait for it to be reviewed.';
      }
      return err.message || 'Could not submit your request. Please try again.';
    }
    return 'Could not submit your request. Please try again.';
  }

  // Does the bank field carry anything renderable (a string or a known field)?
  const bankHasContent =
    !!asText(methods?.bank) ||
    (methods?.bank &&
      typeof methods.bank === 'object' &&
      BANK_FIELDS.some((f) => firstField(methods.bank, f.keys)));
  const bkashNumber = methodNumber(methods?.bkash);
  const rocketNumber = methodNumber(methods?.rocket);
  const nagadNumber = methodNumber(methods?.nagad);
  const hasAnyMethod = !!bkashNumber || !!rocketNumber || !!nagadNumber || !!bankHasContent;

  const popularId = popularPackageId(packages);

  return (
    <>
      <div className="page-header buy-header">
        <h1>Buy Credits</h1>
        <p>Top up your verification credits — pick a package and pay in seconds.</p>
      </div>

      {topError && <div className="alert alert-error">{topError}</div>}

      {/* ---------- Packages ---------- */}
      <div className="card-title">Choose a package</div>
      {loadingTop ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Spinner size={24} />
        </div>
      ) : packages.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">💳</div>
            <h3>No packages available</h3>
            <p>Please check back shortly.</p>
          </div>
        </div>
      ) : (
        <div className="pkg-grid">
          {packages.map((pkg, i) => {
            const active = pkg.id === selectedId;
            const popular = pkg.id === popularId;
            const accent = PKG_ACCENTS[i % PKG_ACCENTS.length];
            return (
              <button
                type="button"
                key={pkg.id}
                className={`pkg-card${active ? ' active' : ''}${popular ? ' popular' : ''}`}
                style={{ '--accent': accent }}
                onClick={() => selectPackage(pkg)}
                aria-pressed={active}
              >
                <span className="pkg-strip" aria-hidden="true" />
                {popular && <span className="pkg-badge">★ Most popular</span>}
                <div className="pkg-name">{asText(pkg.name) || 'Package'}</div>
                <div className="pkg-credits">{formatNum(pkg.credits)}</div>
                <div className="pkg-credits-cap">credits</div>
                <div className="pkg-price">{formatMoney(pkg.price_amount, pkg.currency)}</div>
                <div className="pkg-select" aria-hidden="true">
                  {active ? '✓ Selected' : 'Select'}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ---------- How it works + payment instructions ---------- */}
      {!loadingTop && (
        <div className="card mt-24">
          <div className="card-title">How to pay</div>
          <div className="pay-steps">
            <div className="pay-step">
              <span className="pay-step-num">1</span>
              <span>Send the exact amount to one of the methods below.</span>
            </div>
            <div className="pay-step">
              <span className="pay-step-num">2</span>
              <span>Then submit the form with your transaction ID.</span>
            </div>
          </div>

          <div className="brand-methods mt-16">
            {bkashNumber && <BrandMethodCard brand={BRAND.bkash} value={bkashNumber} />}
            {rocketNumber && <BrandMethodCard brand={BRAND.rocket} value={rocketNumber} />}
            {nagadNumber && <BrandMethodCard brand={BRAND.nagad} value={nagadNumber} />}
            {methods?.bank != null && <BankDetails bank={methods.bank} />}
          </div>

          {asText(methods?.note) && (
            <div className="pay-note mt-16">
              <span className="pay-note-icon" aria-hidden="true">i</span>
              <span>{asText(methods.note)}</span>
            </div>
          )}
          {!hasAnyMethod && (
            <p className="field-hint mt-0">Payment instructions are not available right now.</p>
          )}
        </div>
      )}

      {/* ---------- Request form ---------- */}
      <div className="card mt-24">
        <div className="card-title">Submit your payment</div>

        <form onSubmit={onSubmit}>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="pay-method">Payment method</label>
              <select
                id="pay-method"
                className="input"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="pay-trx">Transaction ID (TrxID)</label>
              <input
                id="pay-trx"
                className="input"
                type="text"
                placeholder="e.g. 9XYZ12AB34"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="pay-amount">Amount</label>
              <input
                id="pay-amount"
                className="input"
                type="number"
                min="0"
                step="any"
                placeholder="Amount sent"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="pay-credits">Credits</label>
              <input
                id="pay-credits"
                className="input"
                type="number"
                min="0"
                step="1"
                placeholder="Credits to receive"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="pay-sender">{senderLabel(method)}</label>
              <input
                id="pay-sender"
                className="input"
                type="text"
                placeholder={method === 'bank' ? 'Sender name / reference' : '01XXXXXXXXX'}
                value={senderInfo}
                onChange={(e) => setSenderInfo(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="pay-note">Note (optional)</label>
              <input
                id="pay-note"
                className="input"
                type="text"
                placeholder="Anything we should know"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {formError && <div className="alert alert-error mt-8">{formError}</div>}
          {success && <div className="alert alert-success mt-8">{success}</div>}

          <div className="row-between mt-8" style={{ flexWrap: 'wrap' }}>
            <p className="field-hint mt-0">
              {selectedId != null
                ? 'Amount and credits prefilled from your selected package — edit if needed.'
                : 'Select a package above, or enter the amount and credits manually.'}
            </p>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? <Spinner onDark /> : 'Submit request'}
            </button>
          </div>
        </form>
      </div>

      {/* ---------- My payment requests ---------- */}
      <div className="mt-24">
        <div className="card-title">My payment requests</div>

        {reqError && <div className="alert alert-error">{reqError}</div>}

        {loadingReqs ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <Spinner size={24} />
          </div>
        ) : requests.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🧾</div>
              <h3>No requests yet</h3>
              <p>Your payment requests will appear here after you submit one.</p>
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Credits</th>
                  <th>Transaction ID</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td style={{ textTransform: 'capitalize' }}>{asText(r.method) || '—'}</td>
                    <td className="cell-score">{formatNum(r.amount)}</td>
                    <td className="cell-score">{formatNum(r.credits)}</td>
                    <td className="mono">{asText(r.transaction_id) || '—'}</td>
                    <td>
                      <PaymentBadge status={r.status} />
                      {asText(r.status) === 'rejected' && asText(r.admin_note) && (
                        <div className="field-hint mt-0" style={{ marginTop: 4 }}>
                          {asText(r.admin_note)}
                        </div>
                      )}
                    </td>
                    <td className="cell-muted">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
