import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import Spinner from '../components/Spinner';
import StatusBadge from '../components/StatusBadge';

/**
 * Verification history: a paginated table from GET /account/history.
 * Uses limit + offset for Prev/Next paging.
 */

const PAGE_SIZE = 25;

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function History() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (nextOffset) => {
      setLoading(true);
      setError('');
      try {
        const data = await api.history(token, { limit: PAGE_SIZE, offset: nextOffset });
        setRows(data.results || []);
        setOffset(nextOffset);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    load(0);
  }, [load]);

  // We don't get a total count from the API, so infer "has next" from whether
  // this page came back full.
  const hasNext = rows.length === PAGE_SIZE;
  const hasPrev = offset > 0;
  const rangeStart = rows.length === 0 ? 0 : offset + 1;
  const rangeEnd = offset + rows.length;

  return (
    <>
      <div className="page-header">
        <h1>History</h1>
        <p>Your most recent verifications.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <Spinner size={24} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📭</div>
            <h3>No verifications yet</h3>
            <p>
              Once you verify some emails, they&apos;ll show up here.{' '}
              <Link to="/verify">Verify your first email →</Link>
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-email">{r.email}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="cell-score">{r.score ?? '—'}</td>
                    <td className="cell-muted">{formatDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <span className="range">
              Showing {rangeStart}–{rangeEnd}
            </span>
            <div className="controls">
              <button
                className="btn btn-secondary"
                onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                disabled={!hasPrev || loading}
              >
                ← Prev
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => load(offset + PAGE_SIZE)}
                disabled={!hasNext || loading}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
