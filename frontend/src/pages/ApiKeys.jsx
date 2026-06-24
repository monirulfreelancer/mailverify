import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Spinner from '../components/Spinner';

/**
 * API keys management:
 *   - list keys (metadata only — the raw key is never retrievable again)
 *   - create a key -> reveal the RAW key ONCE in a copyable box
 *   - revoke a key
 */

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ApiKeys() {
  const { token } = useAuth();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create-key form.
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  // The freshly-created raw key (shown once).
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  // Track which key id is being revoked.
  const [revokingId, setRevokingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listApiKeys(token);
      setKeys(data.api_keys || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function createKey(e) {
    e.preventDefault();
    setError('');
    setCreating(true);
    setNewKey(null);
    setCopied(false);
    try {
      const data = await api.createApiKey(token, name.trim() || 'API key');
      setNewKey(data); // { id, name, api_key, note, created_at }
      setName('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function copyKey() {
    if (!newKey?.api_key) return;
    try {
      await navigator.clipboard.writeText(newKey.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable over http; user can select manually */
    }
  }

  async function revoke(id) {
    if (!window.confirm('Revoke this API key? Applications using it will stop working.')) return;
    setRevokingId(id);
    setError('');
    try {
      await api.revokeApiKey(token, id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>API Keys</h1>
        <p>Use these keys to call the verification API from your own apps.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Create a key */}
      <div className="card">
        <div className="card-title">Create a new key</div>
        <form className="inline-form" onSubmit={createKey}>
          <input
            className="input"
            type="text"
            placeholder="Key name (e.g. Production server)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={creating}
          />
          <button className="btn btn-primary" type="submit" disabled={creating}>
            {creating ? <Spinner onDark /> : 'Create key'}
          </button>
        </form>

        {newKey && (
          <div className="key-reveal mt-16">
            <div className="alert alert-success mb-0" style={{ marginBottom: 8 }}>
              ⚠️ Copy your new key now — for security, it <strong>won&apos;t be shown again</strong>.
            </div>
            <div className="key-box">
              <code>{newKey.api_key}</code>
              <button className="btn btn-secondary" type="button" onClick={copyKey}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Existing keys */}
      <div className="card">
        <div className="card-title">Your keys</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <Spinner size={22} />
          </div>
        ) : keys.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🔑</div>
            <h3>No API keys yet</h3>
            <p>Create your first key above to start using the API.</p>
          </div>
        ) : (
          <div className="table-wrap" style={{ boxShadow: 'none', border: '1px solid var(--border)' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Created</th>
                  <th>Last used</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const revoked = !!k.revoked_at;
                  return (
                    <tr key={k.id}>
                      <td className="cell-email">{k.name || 'Untitled key'}</td>
                      <td className="cell-muted">{formatDate(k.created_at)}</td>
                      <td className="cell-muted">
                        {k.last_used_at ? formatDate(k.last_used_at) : 'Never'}
                      </td>
                      <td>
                        {revoked ? (
                          <span className="badge invalid">Revoked</span>
                        ) : (
                          <span className="badge valid">Active</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {!revoked && (
                          <button
                            className="btn btn-danger"
                            onClick={() => revoke(k.id)}
                            disabled={revokingId === k.id}
                          >
                            {revokingId === k.id ? <Spinner size={14} /> : 'Revoke'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
