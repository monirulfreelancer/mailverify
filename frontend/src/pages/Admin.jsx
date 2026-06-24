import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api';
import Spinner from '../components/Spinner';

/**
 * Admin dashboard (role-gated to admin/manager — enforced in App.jsx and again
 * on the server). Shows platform-wide stats and a searchable, paginated user
 * table with inline controls to adjust credits (admin + manager) and change
 * role/status (admin only).
 */

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

const ROLE_OPTIONS = ['user', 'manager', 'admin'];
const STATUS_OPTIONS = ['active', 'suspended', 'banned'];

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

// Friendly message for the common admin failure modes, keeping 403 explicit.
function mutationError(err) {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Admins only.';
    return err.message || 'Action failed.';
  }
  return 'Action failed.';
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

const STAT_CARDS = [
  { key: 'total_users', label: 'Total users' },
  { key: 'active_users', label: 'Active', color: 'var(--green)' },
  {
    // Suspended + banned combined into a single card.
    key: '_suspended_banned',
    label: 'Suspended / banned',
    color: 'var(--red)',
    derive: (s) => (s.suspended_users ?? 0) + (s.banned_users ?? 0),
  },
  { key: 'total_verifications', label: 'Total verifications' },
  { key: 'total_credits_outstanding', label: 'Credits outstanding', accent: true },
  { key: 'total_bulk_jobs', label: 'Bulk jobs' },
  { key: 'verifications_today', label: 'Verifications today' },
];

function StatsRow({ stats, loading, error }) {
  if (error) return <div className="alert alert-error">{error}</div>;
  return (
    <div className="admin-stats">
      {STAT_CARDS.map((c) => {
        const value = loading
          ? '—'
          : c.derive
            ? formatNum(c.derive(stats || {}))
            : formatNum(stats?.[c.key]);
        return (
          <div className="stat" key={c.key}>
            <div className="stat-label">{c.label}</div>
            <div
              className={`stat-value${c.accent ? ' accent' : ''}`}
              style={c.color ? { color: c.color } : undefined}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* User row                                                                    */
/* -------------------------------------------------------------------------- */

function UserRow({ row, canEdit, isSelf, token, onUpdate }) {
  const [savingRole, setSavingRole] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingCredits, setSavingCredits] = useState(false);

  const [creditAmount, setCreditAmount] = useState('');
  const [creditMode, setCreditMode] = useState('add'); // 'add' | 'set'

  // Inline per-row feedback (auto-clears).
  const [msg, setMsg] = useState(null); // { type: 'ok'|'err', text }
  const msgTimer = useRef(null);

  useEffect(() => () => clearTimeout(msgTimer.current), []);

  function flash(type, text) {
    setMsg({ type, text });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 3500);
  }

  async function changeRole(role) {
    if (role === row.role || savingRole) return;
    setSavingRole(true);
    try {
      const updated = await api.adminSetRole(token, row.id, role);
      onUpdate(row.id, { role: updated?.user?.role ?? updated?.role ?? role });
      flash('ok', `Role → ${role}`);
    } catch (err) {
      flash('err', mutationError(err));
    } finally {
      setSavingRole(false);
    }
  }

  async function changeStatus(status) {
    if (status === row.status || savingStatus) return;
    setSavingStatus(true);
    try {
      const updated = await api.adminSetStatus(token, row.id, status);
      onUpdate(row.id, { status: updated?.user?.status ?? updated?.status ?? status });
      flash('ok', `Status → ${status}`);
    } catch (err) {
      flash('err', mutationError(err));
    } finally {
      setSavingStatus(false);
    }
  }

  async function applyCredits() {
    const amount = Number(creditAmount);
    if (creditAmount === '' || Number.isNaN(amount) || savingCredits) return;
    setSavingCredits(true);
    try {
      const res = await api.adminSetCredits(token, row.id, { amount, mode: creditMode });
      const balance = typeof res?.balance === 'number' ? res.balance : undefined;
      onUpdate(row.id, balance !== undefined ? { credits: balance } : {});
      setCreditAmount('');
      flash('ok', balance !== undefined ? `Credits → ${formatNum(balance)}` : 'Credits updated');
    } catch (err) {
      flash('err', mutationError(err));
    } finally {
      setSavingCredits(false);
    }
  }

  return (
    <tr>
      <td className="cell-email">{row.email}</td>

      {/* Role */}
      <td>
        {canEdit && !isSelf ? (
          <select
            className="admin-select"
            value={row.role}
            disabled={savingRole}
            onChange={(e) => changeRole(e.target.value)}
            aria-label="Change role"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        ) : (
          <span className="admin-pill" title={isSelf ? 'You can’t change your own role' : undefined}>
            {row.role}
          </span>
        )}
      </td>

      {/* Status */}
      <td>
        {canEdit && !isSelf ? (
          <select
            className={`admin-select status status-${row.status}`}
            value={row.status}
            disabled={savingStatus}
            onChange={(e) => changeStatus(e.target.value)}
            aria-label="Change status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <span
            className={`admin-pill status-${row.status}`}
            title={isSelf ? 'You can’t change your own status' : undefined}
          >
            {row.status}
          </span>
        )}
      </td>

      {/* Credits + inline adjust */}
      <td>
        <div className="credit-cell">
          <span className="credit-bal">{formatNum(row.credits)}</span>
          <div className="credit-adjust">
            <div className="seg">
              <button
                type="button"
                className={`seg-btn${creditMode === 'add' ? ' on' : ''}`}
                onClick={() => setCreditMode('add')}
              >
                Add
              </button>
              <button
                type="button"
                className={`seg-btn${creditMode === 'set' ? ' on' : ''}`}
                onClick={() => setCreditMode('set')}
              >
                Set
              </button>
            </div>
            <input
              className="input credit-input"
              type="number"
              placeholder={creditMode === 'add' ? '+/−' : 'value'}
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCredits();
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={applyCredits}
              disabled={savingCredits || creditAmount === ''}
            >
              {savingCredits ? <Spinner size={12} /> : 'Apply'}
            </button>
          </div>
        </div>
      </td>

      <td className="cell-score">{formatNum(row.usage_count)}</td>
      <td className="cell-muted">{formatDate(row.created_at)}</td>

      {/* Inline feedback */}
      <td className="cell-feedback">
        {msg && (
          <span className={`row-msg ${msg.type === 'ok' ? 'ok' : 'err'}`}>{msg.text}</span>
        )}
      </td>
    </tr>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function Admin() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Debounce the search box; reset to page 1 whenever the term changes.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Load stats once.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setStatsLoading(true);
      setStatsError('');
      try {
        const data = await api.adminGetStats(token);
        if (!cancelled) setStats(data);
      } catch (err) {
        if (!cancelled) setStatsError(mutationError(err));
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.adminListUsers(token, { limit: PAGE_SIZE, offset, search });
      setUsers(data.users || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.users || []).length);
    } catch (err) {
      setError(mutationError(err));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [token, offset, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Optimistically patch a single row after a mutation.
  const handleUpdate = useCallback((id, patch) => {
    if (!patch || Object.keys(patch).length === 0) return;
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }, []);

  const hasPrev = offset > 0;
  const hasNext = offset + users.length < total;
  const rangeStart = users.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + users.length;

  return (
    <>
      <div className="page-header">
        <h1>Admin</h1>
        <p>
          Platform overview and user management.
          {!isAdmin && ' You have manager access — you can adjust credits but not change roles or statuses.'}
        </p>
      </div>

      <StatsRow stats={stats} loading={statsLoading} error={statsError} />

      <div className="mt-24">
        <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title" style={{ marginBottom: 0 }}>Users</div>
          <input
            className="input admin-search"
            type="search"
            placeholder="Search by email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <Spinner size={24} />
          </div>
        ) : users.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">🔍</div>
              <h3>No users found</h3>
              <p>{search ? `Nothing matched “${search}”.` : 'There are no users to show.'}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="data admin-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Credits</th>
                    <th>Usage</th>
                    <th>Created</th>
                    <th aria-label="Feedback" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => (
                    <UserRow
                      key={row.id}
                      row={row}
                      canEdit={isAdmin}
                      isSelf={row.id === user?.id}
                      token={token}
                      onUpdate={handleUpdate}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span className="range">
                Showing {rangeStart}–{rangeEnd} of {formatNum(total)}
              </span>
              <div className="controls">
                <button
                  className="btn btn-secondary"
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  disabled={!hasPrev || loading}
                >
                  ← Prev
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  disabled={!hasNext || loading}
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
