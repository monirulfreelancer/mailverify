import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Spinner from '../components/Spinner';
import ResultCard from '../components/ResultCard';

/**
 * Dashboard: credit balance, usage stats (counts by status), and a quick
 * single-verify box.
 */

// Status rows shown in the usage breakdown, with their swatch colors.
const STATUS_ROWS = [
  { key: 'valid', label: 'Valid', color: 'var(--green)' },
  { key: 'invalid', label: 'Invalid', color: 'var(--red)' },
  { key: 'accept_all', label: 'Accept-all', color: 'var(--amber)' },
  { key: 'disposable', label: 'Disposable', color: 'var(--purple)' },
  { key: 'unknown', label: 'Unknown', color: 'var(--gray)' },
];

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

  return (
    <>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>An overview of your credits and verification activity.</p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-3">
        <div className="stat">
          <div className="stat-label">Credits remaining</div>
          <div className="stat-value accent">
            {credits === null || credits === undefined ? '—' : credits.toLocaleString()}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Total verifications</div>
          <div className="stat-value">
            {loading ? '—' : (usage?.total ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Valid emails found</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {loading ? '—' : (usage?.valid ?? 0).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid grid-2 mt-24">
        {/* Quick verify */}
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
            <button className="btn btn-primary" type="submit" disabled={verifying || !email.trim()}>
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

        {/* Usage breakdown */}
        <div className="card">
          <div className="card-title">Results breakdown</div>
          {loadError && <div className="alert alert-error">{loadError}</div>}
          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Spinner size={22} />
            </div>
          ) : (
            <div>
              {STATUS_ROWS.map((row) => (
                <div className="stat-row" key={row.key}>
                  <span className="label">
                    <span className="swatch" style={{ background: row.color }} />
                    {row.label}
                  </span>
                  <span className="value">{(usage?.[row.key] ?? 0).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
