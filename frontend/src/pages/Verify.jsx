import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Spinner from '../components/Spinner';
import ResultCard from '../components/ResultCard';

/**
 * Verify page: a single email input + Verify button. Calls POST /verify/single
 * with the Bearer token, renders a color-coded result card, and refreshes the
 * credit balance afterwards.
 */
export default function Verify() {
  const { token, credits, refreshCredits } = useAuth();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setBusy(true);
    setResult(null);
    try {
      const r = await api.verifySingle(token, email.trim());
      setResult(r);
      refreshCredits(); // balance changes after a charge
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-header row-between">
        <div>
          <h1>Verify an email</h1>
          <p>Check deliverability in real time. Each check uses 1 credit.</p>
        </div>
        {credits !== null && credits !== undefined && (
          <span className="credit-pill">
            <span className="dot" />
            {credits.toLocaleString()} credits
          </span>
        )}
      </div>

      <div className="card">
        <form className="inline-form" onSubmit={onSubmit}>
          <input
            className="input"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <button className="btn btn-primary btn-lg" type="submit" disabled={busy || !email.trim()}>
            {busy ? <Spinner onDark /> : 'Verify'}
          </button>
        </form>

        {error && <div className="alert alert-error mt-16">{error}</div>}
      </div>

      {result && (
        <div className="mt-24">
          <ResultCard result={result} />
        </div>
      )}
    </>
  );
}
