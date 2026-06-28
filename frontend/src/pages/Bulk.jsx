import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api';
import Spinner from '../components/Spinner';

/**
 * Bulk verification page.
 *
 * - Upload a CSV/TXT file (drag-and-drop or picker) -> POST /bulk/upload.
 * - List the user's bulk jobs (GET /bulk/jobs) with per-job progress + counts.
 * - Live progress: while any job is queued/processing, poll the jobs list every
 *   ~2.5s; stop (and clean up) when nothing is active.
 * - Download a completed job's result CSV (auth'd blob download).
 */

const POLL_MS = 2500;
const ACCEPT = '.csv,.txt';

// Job statuses that mean "still working" — drives polling + progress UI.
const ACTIVE = new Set(['queued', 'processing']);

const STATUS_LABELS = {
  queued: 'Queued',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

// Per-job result breakdown for the donut + legend. Colors match the app-wide
// status mapping used by the Dashboard donut (valid=green, catch-all=amber,
// disposable=purple, invalid=red, unknown=gray). `accept_all` and `catch_all`
// are the same status spelled two ways across the API.
const STATUS_SEGMENTS = [
  { key: 'valid', label: 'Valid', color: '#16a34a' },
  { key: 'catch_all', label: 'Catch-all', color: '#d97706', altKey: 'accept_all' },
  { key: 'disposable', label: 'Disposable', color: '#9333ea', altKey: 'disposable_count' },
  { key: 'invalid', label: 'Invalid', color: '#dc2626' },
  { key: 'unknown', label: 'Unknown', color: '#64748b' },
];

// Read a status count off a job, tolerating either spelling of the field.
// Returns null when the field is absent entirely (so the slice can be omitted
// rather than rendered as a zero — e.g. disposable, which the job-level
// aggregate may not expose).
function countFor(job, seg) {
  if (!job) return null;
  if (typeof job[seg.key] === 'number') return job[seg.key];
  if (seg.altKey && typeof job[seg.altKey] === 'number') return job[seg.altKey];
  return null;
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Normalize the jobs response: the API may return { jobs: [...] } or a bare array.
function extractJobs(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.jobs)) return data.jobs;
  return [];
}

/**
 * Lightweight inline-SVG donut chart — same technique/colors as the Dashboard
 * donut, sized down for a per-job mini stats panel. No chart dependency.
 */
function Donut({ segments, size = 124, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Result breakdown">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
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
                  strokeLinecap="butt"
                />
              );
              offset += len;
              return el;
            })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text)">
        {total.toLocaleString()}
      </text>
      <text x="50%" y="61%" textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-muted)">
        checked
      </text>
    </svg>
  );
}

function BulkStatusBadge({ status }) {
  const cls = STATUS_LABELS[status] ? status : 'queued';
  const label = STATUS_LABELS[status] || status || 'Queued';
  return <span className={`badge ${cls}`}>{label}</span>;
}

function ProgressBar({ processed, total, status }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const cls =
    status === 'completed' ? ' done' : status === 'failed' ? ' failed' : '';
  return (
    <div className="bulk-progress-row">
      <div className="progress-track" style={{ flex: 1 }}>
        <div className={`progress-fill${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="pct">
        {processed.toLocaleString()}/{total.toLocaleString()} · {pct}%
      </span>
    </div>
  );
}

function JobCard({ job, token, onError }) {
  const [downloading, setDownloading] = useState(false);

  const total = job.total_emails ?? 0;
  const processed = job.processed ?? 0;

  // Build the donut segments from whatever per-status counts the job exposes.
  // Slices whose field is absent (e.g. disposable, which the job aggregate may
  // not track) are dropped so we never render a phantom zero slice.
  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    value: countFor(job, seg),
  })).filter((seg) => seg.value != null);
  const breakdownTotal = segments.reduce((sum, s) => sum + s.value, 0);
  const showBreakdown = breakdownTotal > 0;

  async function download() {
    setDownloading(true);
    try {
      await api.bulkDownload(token, job.id, `${job.filename || 'bulk'}-results.csv`);
    } catch (err) {
      onError(err.message || 'Could not download the file.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="bulk-job">
      <div className="bulk-job-head">
        <div className="bulk-job-file">
          <span style={{ fontSize: 20 }}>📄</span>
          <div style={{ minWidth: 0 }}>
            <div className="name">{job.filename || `Job ${job.id}`}</div>
            <div className="bulk-job-meta">
              {total.toLocaleString()} emails
              {job.credits_charged != null && ` · ${job.credits_charged.toLocaleString()} credits`}
              {formatDate(job.created_at) && ` · ${formatDate(job.created_at)}`}
            </div>
          </div>
        </div>
        <BulkStatusBadge status={job.status} />
      </div>

      <ProgressBar processed={processed} total={total} status={job.status} />

      {showBreakdown && (
        <div className="bulk-breakdown">
          <div className="donut-wrap">
            <Donut segments={segments} />
            <div className="donut-legend">
              {segments.map((seg) => {
                const pct =
                  breakdownTotal > 0 ? Math.round((seg.value / breakdownTotal) * 100) : 0;
                return (
                  <div className="legend-row" key={seg.key}>
                    <span className="label">
                      <span className="swatch" style={{ background: seg.color, borderRadius: 3 }} />
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
        </div>
      )}

      {job.status === 'completed' && (
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-secondary"
            onClick={download}
            disabled={downloading}
          >
            {downloading ? <Spinner size={14} /> : '⬇ Download CSV'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Bulk() {
  const { token, refreshCredits } = useAuth();

  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [success, setSuccess] = useState('');

  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [listError, setListError] = useState('');

  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  // Load (or refresh) the jobs list. `quiet` skips the loading spinner for polls.
  const loadJobs = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoadingJobs(true);
      try {
        const data = await api.listBulkJobs(token);
        setJobs(extractJobs(data));
        setListError('');
      } catch (err) {
        if (!quiet) setListError(err.message);
      } finally {
        if (!quiet) setLoadingJobs(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  // Polling: run an interval whenever at least one job is active; tear it down
  // when none are (or on unmount).
  const hasActive = jobs.some((j) => ACTIVE.has(j.status));
  useEffect(() => {
    if (!hasActive) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return; // already polling
    pollRef.current = setInterval(() => loadJobs(true), POLL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasActive, loadJobs]);

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setUploadError('');
    setSuccess('');
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) pickFile(f);
  }

  async function onUpload() {
    if (!file || uploading) return;
    setUploading(true);
    setUploadError('');
    setSuccess('');
    try {
      const res = await api.bulkUpload(token, file);
      const queued = res.totalEmails ?? 0;
      const used = res.creditsCharged ?? 0;
      let note = `Queued ${queued.toLocaleString()} emails, ${used.toLocaleString()} credits used.`;
      if (res.duplicates_removed) note += ` ${res.duplicates_removed.toLocaleString()} duplicate(s) removed.`;
      if (res.invalid_skipped) note += ` ${res.invalid_skipped.toLocaleString()} invalid line(s) skipped.`;
      setSuccess(note);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      refreshCredits();
      loadJobs(true); // surface the new job immediately
    } catch (err) {
      setUploadError(uploadErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  function uploadErrorMessage(err) {
    if (err instanceof ApiError) {
      if (err.status === 402) {
        const b = err.body || {};
        const need = b.required ?? b.creditsRequired ?? b.creditsCharged;
        const have = b.available ?? b.credits ?? b.balance;
        if (need != null && have != null) {
          return `Not enough credits — this file needs ${Number(need).toLocaleString()} credits but you have ${Number(have).toLocaleString()}.`;
        }
        return 'Not enough credits to verify this file.';
      }
      if (err.status === 503) {
        return 'Bulk verification is temporarily unavailable, please try again shortly.';
      }
      return err.message || 'Upload failed. Please try again.';
    }
    return 'Upload failed. Please try again.';
  }

  return (
    <>
      <div className="page-header">
        <h1>Bulk verification</h1>
        <p>
          Upload a CSV or TXT file of email addresses and we&apos;ll verify them in
          the background. 1 credit per email.
        </p>
      </div>

      {/* Upload card */}
      <div className="card">
        <div
          className={`dropzone${dragging ? ' dragging' : ''}${file ? ' has-file' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
        >
          {file ? (
            <span className="dz-file">
              <span className="dz-file-icon">📄</span>
              {file.name}
              <button
                type="button"
                className="dz-clear"
                title="Remove file"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setSuccess('');
                  setUploadError('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                ✕
              </button>
            </span>
          ) : (
            <>
              <div className="dz-icon">⬆️</div>
              <div className="dz-main">Drag &amp; drop a file here, or click to browse</div>
              <div className="dz-sub">CSV or TXT</div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
        </div>

        <div className="row-between" style={{ marginTop: 16, alignItems: 'flex-start' }}>
          <p className="field-hint mt-0">
            Max 50,000 emails per file. We auto-detect the email column.
          </p>
          <button
            className="btn btn-primary"
            onClick={onUpload}
            disabled={!file || uploading}
          >
            {uploading ? <Spinner onDark /> : 'Upload & verify'}
          </button>
        </div>

        {uploadError && <div className="alert alert-error mt-16">{uploadError}</div>}
        {success && <div className="alert alert-success mt-16">{success}</div>}
      </div>

      {/* Jobs list */}
      <div className="mt-24">
        <div className="card-title">Your bulk jobs</div>

        {listError && <div className="alert alert-error">{listError}</div>}

        {loadingJobs ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <Spinner size={24} />
          </div>
        ) : jobs.length === 0 ? (
          <div className="card">
            <div className="empty">
              <div className="empty-icon">📦</div>
              <h3>No bulk jobs yet</h3>
              <p>Upload a file to get started.</p>
            </div>
          </div>
        ) : (
          <div>
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} token={token} onError={setListError} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
