import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Spinner from '../components/Spinner';
import ResultCard from '../components/ResultCard';

/**
 * Dashboard: a promo banner, credit / activity cards, a usage donut broken down
 * by result status, and a quick single-verify box.
 */

// Status segments for the usage donut + legend. Colors match the app-wide
// status mapping (valid=green, invalid=red, accept_all=amber,
// disposable=purple, unknown=gray). `accept_all` and `catch_all` are the same.
const STATUS_SEGMENTS = [
  { key: 'valid', label: 'Valid', color: '#16a34a' },
  { key: 'accept_all', label: 'Catch-all', color: '#d97706', altKey: 'catch_all' },
  { key: 'disposable', label: 'Disposable', color: '#9333ea' },
  { key: 'invalid', label: 'Invalid', color: '#dc2626' },
  { key: 'unknown', label: 'Unknown', color: '#64748b' },
];

// Reads a status count from the usage payload, tolerating either the
// `accept_all` or `catch_all` spelling.
function countFor(usage, seg) {
  if (!usage) return 0;
  const a = usage[seg.key];
  if (typeof a === 'number') return a;
  if (seg.altKey && typeof usage[seg.altKey] === 'number') return usage[seg.altKey];
  return 0;
}

/** Lightweight inline-SVG donut chart. No chart dependency. */
function Donut({ segments, size = 168, stroke = 26 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {/* Track (also the empty-state ring when total is 0) */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--gray-bg)"
          strokeWidth={stroke}
        />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const len = (s.value / total) * c;
              const dash = `${len} ${c - len}`;
              const el = (
                <circle
                  key={s.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={stroke}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
      </g>
      <text
        x="50%"
        y="46%"
        textAnchor="middle"
        fontSize="26"
        fontWeight="800"
        fill="var(--text)"
      >
        {total.toLocaleString()}
      </text>
      <text
        x="50%"
        y="60%"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--text-muted)"
      >
        verified
      </text>
    </svg>
  );
}

// Static, lightweight launch-offer countdown (decorative — no backend).
// Counts down to a fixed near date; resets harmlessly once passed.
const OFFER_DEADLINE = new Date('2026-07-15T23:59:59');

function useCountdown(deadline) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  let diff = Math.max(0, deadline.getTime() - now);
  const d = Math.floor(diff / 86400000);
  diff -= d * 86400000;
  const h = Math.floor(diff / 3600000);
  diff -= h * 3600000;
  const m = Math.floor(diff / 60000);
  diff -= m * 60000;
  const s = Math.floor(diff / 1000);
  return { d, h, m, s };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

export default function Dashboard() {
  const { token, credits, refreshCredits } = useAuth();
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Quick-verify box state.
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [comingSoon, setComingSoon] = useState(false);

  const { d, h, m, s } = useCountdown(OFFER_DEADLINE);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [u] = await Promise.all([api.usage(token), refreshCredits()]);
        if (!cancelled) setUsage(u);
      } catch (err) {
        if (!cancelled) setLoadError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function quickVerify(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setVerifyError('');
    setVerifying(true);
    setResult(null);
    try {
      const r = await api.verifySingle(token, email.trim());
      setResult(r);
      refreshCredits();
    } catch (err) {
      setVerifyError(err.message);
    } finally {
      setVerifying(false);
    }
  }

  const segments = useMemo(
    () =>
      STATUS_SEGMENTS.map((seg) => ({
        ...seg,
        value: countFor(usage, seg),
      })),
    [usage]
  );
  const total = segments.reduce((sum, x) => sum + x.value, 0);

  const creditLabel =
    credits === null || credits === undefined ? '—' : credits.toLocaleString();

  return (
    <>
      {/* ---------- Promo banner (placeholder) ---------- */}
      <div className="promo-banner">
        <div className="promo-left">
          <span className="promo-tag">Limited time</span>
          <div>
            <div className="promo-title">Launch offer coming soon 🎉</div>
            <div className="promo-sub">
              Early-bird credit bundles at a special price — stay tuned.
            </div>
          </div>
        </div>
        <div className="promo-right">
          <div className="countdown" aria-label="Offer countdown">
            {[
              { v: d, l: 'days' },
              { v: h, l: 'hrs' },
              { v: m, l: 'min' },
              { v: s, l: 'sec' },
            ].map((u, i) => (
              <div className="cd-cell" key={i}>
                <span className="cd-num">{pad(u.v)}</span>
                <span className="cd-lbl">{u.l}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-redeem" onClick={() => setComingSoon(true)}>
            Redeem
          </button>
        </div>
      </div>

      <div className="page-header mt-24">
        <h1>Dashboard</h1>
        <p>An overview of your credits and verification activity.</p>
      </div>

      {/* ---------- Stat cards ---------- */}
      <div className="grid grid-3">
        <div className="stat stat-feature">
          <div className="stat-label">Available credit</div>
          <div className="stat-value accent">{creditLabel}</div>
          <div className="stat-caption">Validity: Lifetime</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total verifications</div>
          <div className="stat-value">
            {loading ? '—' : (usage?.total ?? total).toLocaleString()}
          </div>
          <div className="stat-caption">All time</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total purchase</div>
          <div className="stat-value">0</div>
          <div className="stat-caption">Payments coming soon</div>
        </div>
      </div>

      <div className="grid grid-2 mt-24 dash-split">
        {/* ---------- Usage donut ---------- */}
        <div className="card">
          <div className="card-title">Usage overview</div>
          {loadError && <div className="alert alert-error">{loadError}</div>}
          {loading ? (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Spinner size={22} />
            </div>
          ) : (
            <div className="donut-wrap">
              <Donut segments={segments} />
              <div className="donut-legend">
                {segments.map((seg) => {
                  const pct = total > 0 ? Math.round((seg.value / total) * 100) : 0;
                  return (
                    <div className="legend-row" key={seg.key}>
                      <span className="label">
                        <span
                          className="swatch"
                          style={{ background: seg.color, borderRadius: 3 }}
                        />
                        {seg.label}
                      </span>
                      <span className="value">
                        {seg.value.toLocaleString()}
                        <span className="legend-pct">{pct}%</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!loading && total === 0 && (
            <p className="field-hint mt-16" style={{ textAlign: 'center' }}>
              No verifications yet — run one below to see your breakdown.
            </p>
          )}
        </div>

        {/* ---------- Quick verify ---------- */}
        <div className="card">
          <div className="card-title">Quick verify</div>
          <form className="inline-form" onSubmit={quickVerify}>
            <input
              className="input"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={verifying}
            />
            <button
              className="btn btn-primary"
              type="submit"
              disabled={verifying || !email.trim()}
            >
              {verifying ? <Spinner onDark /> : 'Verify'}
            </button>
          </form>

          {verifyError && <div className="alert alert-error mt-16">{verifyError}</div>}
          {result && (
            <div className="mt-16">
              <ResultCard result={result} />
            </div>
          )}
          {!result && !verifyError && (
            <p className="field-hint mt-8">Each verification uses 1 credit.</p>
          )}
        </div>
      </div>

      {comingSoon && (
        <div className="modal-overlay" onClick={() => setComingSoon(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-emoji" aria-hidden="true">
              🏷️
            </div>
            <h3>Launch offer</h3>
            <p>Coming soon — special launch pricing is on the way. Check back shortly!</p>
            <button
              className="btn btn-primary btn-block"
              onClick={() => setComingSoon(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
