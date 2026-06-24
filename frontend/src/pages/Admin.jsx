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
/* Payment requests                                                            */
/* -------------------------------------------------------------------------- */

const PAYMENTS_PAGE_SIZE = 50;

const PAYMENT_STATUS = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
};

function PaymentBadge({ status }) {
  const cls = PAYMENT_STATUS[status] || 'unknown';
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  return <span className={`badge ${cls}`}>{label}</span>;
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PaymentRow({ row, token, onPatch }) {
  const [working, setWorking] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [msg, setMsg] = useState(null); // { type, text }
  const msgTimer = useRef(null);

  useEffect(() => () => clearTimeout(msgTimer.current), []);

  function flash(type, text) {
    setMsg({ type, text });
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 4000);
  }

  async function approve() {
    if (working) return;
    setWorking(true);
    try {
      await api.adminApprovePayment(token, row.id);
      onPatch(row.id, { status: 'approved' });
      flash('ok', 'Approved & credited');
    } catch (err) {
      flash('err', mutationError(err));
    } finally {
      setWorking(false);
    }
  }

  async function reject() {
    if (working) return;
    setWorking(true);
    try {
      await api.adminRejectPayment(token, row.id, adminNote.trim() || undefined);
      onPatch(row.id, { status: 'rejected', admin_note: adminNote.trim() });
      setRejecting(false);
      setAdminNote('');
      flash('ok', 'Rejected');
    } catch (err) {
      flash('err', mutationError(err));
    } finally {
      setWorking(false);
    }
  }

  const isPending = row.status === 'pending';

  return (
    <tr>
      <td className="cell-email">{row.user_email}</td>
      <td style={{ textTransform: 'capitalize' }}>{row.method}</td>
      <td className="cell-score">{formatNum(row.amount)}</td>
      <td className="cell-score">{formatNum(row.credits)}</td>
      <td className="mono">{row.transaction_id || '—'}</td>
      <td className="cell-muted" title={row.sender_info || ''}>{row.sender_info || '—'}</td>
      <td><PaymentBadge status={row.status} /></td>
      <td className="cell-muted">{formatDateTime(row.created_at)}</td>
      <td className="pay-actions">
        {isPending ? (
          rejecting ? (
            <div className="pay-reject">
              <input
                className="input"
                type="text"
                placeholder="Reason (optional)"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                disabled={working}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') reject();
                  if (e.key === 'Escape') setRejecting(false);
                }}
              />
              <button className="btn btn-danger btn-xs" onClick={reject} disabled={working}>
                {working ? <Spinner size={12} /> : 'Confirm'}
              </button>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setRejecting(false)}
                disabled={working}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="pay-btns">
              <button className="btn btn-primary btn-xs" onClick={approve} disabled={working}>
                {working ? <Spinner size={12} onDark /> : 'Approve'}
              </button>
              <button
                className="btn btn-danger btn-xs"
                onClick={() => setRejecting(true)}
                disabled={working}
              >
                Reject
              </button>
            </div>
          )
        ) : (
          row.admin_note ? <span className="cell-muted">{row.admin_note}</span> : <span className="text-muted">—</span>
        )}
        {msg && (
          <div className={`row-msg ${msg.type === 'ok' ? 'ok' : 'err'}`} style={{ marginTop: 6 }}>
            {msg.text}
          </div>
        )}
      </td>
    </tr>
  );
}

function PaymentsSection({ token }) {
  const [filter, setFilter] = useState('pending'); // 'pending' | 'all'
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.adminListPayments(token, {
        status: filter === 'pending' ? 'pending' : '',
        limit: PAYMENTS_PAGE_SIZE,
        offset: 0,
      });
      setRows(data.requests || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.requests || []).length);
    } catch (err) {
      setError(mutationError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const handlePatch = useCallback((id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  return (
    <div className="mt-24">
      <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          Payment requests
          {filter === 'pending' && pendingCount > 0 && (
            <span className="admin-pill" style={{ marginLeft: 8 }}>{pendingCount} pending</span>
          )}
        </div>
        <div className="seg">
          <button
            type="button"
            className={`seg-btn${filter === 'pending' ? ' on' : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending
          </button>
          <button
            type="button"
            className={`seg-btn${filter === 'all' ? ' on' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Spinner size={24} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">🧾</div>
            <h3>No payment requests</h3>
            <p>{filter === 'pending' ? 'There are no pending requests right now.' : 'No requests to show.'}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data admin-table payments-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Method</th>
                  <th>Amount</th>
                  <th>Credits</th>
                  <th>Transaction ID</th>
                  <th>Sender</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PaymentRow key={row.id} row={row} token={token} onPatch={handlePatch} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="range">
              Showing {rows.length} of {formatNum(total)}
            </span>
          </div>
        </>
      )}
    </div>
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

      <PaymentsSection token={token} />
    </>
  );
}
