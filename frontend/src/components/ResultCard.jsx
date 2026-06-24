import StatusBadge, { statusClass } from './StatusBadge';

/**
 * Renders a verification result (from POST /verify/single) as a polished card:
 * color-coded status, a score bar, and a grid of boolean flags.
 */

// Score bar color tracks the status semantics.
function scoreColor(status) {
  switch (statusClass(status)) {
    case 'valid':
      return 'var(--green)';
    case 'invalid':
      return 'var(--red)';
    case 'accept_all':
    case 'catch_all':
      return 'var(--amber)';
    case 'disposable':
      return 'var(--purple)';
    default:
      return 'var(--gray)';
  }
}

function Flag({ label, value }) {
  return (
    <div className="flag">
      <span>{label}</span>
      <span className={`flag-val ${value ? 'yes' : 'no'}`}>{value ? 'Yes' : 'No'}</span>
    </div>
  );
}

export default function ResultCard({ result }) {
  if (!result) return null;

  const score = typeof result.score === 'number' ? result.score : 0;
  const color = scoreColor(result.status);

  // The engine exposes catch-all as `catch_all`.
  const catchAll = result.catch_all ?? result.accept_all ?? false;

  return (
    <div className="result-card">
      <div className="result-head">
        <div>
          <div className="email">{result.email}</div>
          {result.sub_status && <div className="sub">{result.sub_status}</div>}
        </div>
        <StatusBadge status={result.status} />
      </div>

      <div className="result-body">
        <div className="score-wrap">
          <div className="score-top">
            <span className="score-num" style={{ color }}>
              {score}
              <span className="score-cap" style={{ color: 'var(--text-muted)' }}>
                {' '}
                / 100
              </span>
            </span>
            <span className="score-cap">Confidence score</span>
          </div>
          <div className="score-track">
            <div
              className="score-fill"
              style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: color }}
            />
          </div>
        </div>

        <div className="flags">
          <Flag label="Role address" value={!!result.role} />
          <Flag label="Disposable" value={!!result.disposable} />
          <Flag label="Free provider" value={!!result.free_provider} />
          <Flag label="MX found" value={!!result.mx_found} />
          <Flag label="Catch-all" value={!!catchAll} />
          <Flag label="SMTP confirmed" value={result.smtp_status === 'valid'} />
        </div>
      </div>
    </div>
  );
}
