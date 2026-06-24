import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';

/**
 * Signup page with client-side validation:
 *   - valid email format
 *   - password >= 8 characters
 *   - passwords match
 * On success the AuthContext stores the token; new accounts get free credits.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Signup() {
  const { signup } = useAuth();
  // Prefill the email if it was passed from the landing page hero (?email=...).
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function validate() {
    if (!EMAIL_RE.test(email.trim())) return 'Please enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirm) return 'Passwords do not match.';
    return '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await signup(email.trim().toLowerCase(), password);
      // Redirect handled by <PublicOnly>.
    } catch (err) {
      setError(err.message || 'Signup failed.');
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
        </div>
        <h1>Create your account</h1>
        <p className="auth-sub">Start verifying emails in seconds</p>

        <div className="alert alert-info">
          🎉 New accounts get <strong>25 free credits</strong> — no card required.
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={onSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
            {busy ? <Spinner onDark /> : 'Create account'}
          </button>
        </form>

        <p className="auth-foot">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
