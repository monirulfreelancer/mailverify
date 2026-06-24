import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import Spinner from '../components/Spinner';

/**
 * Login page. On success the AuthContext stores the token and the router
 * redirects to the dashboard (handled by <PublicOnly> in App).
 */
export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email.trim(), password);
      // Redirect happens automatically once isAuthenticated flips.
    } catch (err) {
      setError(err.message || 'Login failed.');
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-logo">
          <Logo />
        </div>
        <h1>Welcome back</h1>
        <p className="auth-sub">Log in to your mailverify account</p>

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
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </div>

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy}>
            {busy ? <Spinner onDark /> : 'Log in'}
          </button>
        </form>

        <p className="auth-foot">
          Don&apos;t have an account? <Link to="/signup">Sign up free</Link>
        </p>
      </div>
    </div>
  );
}
