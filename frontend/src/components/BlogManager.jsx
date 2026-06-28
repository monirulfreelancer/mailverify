import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import Spinner from './Spinner';
import { renderMarkdown } from '../lib/markdown';

/**
 * Admin Blog manager — lives inside the Admin page (admin/manager).
 *
 * Lists all posts (any status) with edit/delete, and an inline editor for
 * creating or updating a post written in Markdown. Delete is admin-only (the
 * button is hidden for managers; the server also enforces it). The editor has a
 * live Markdown preview and a cover-image URL preview.
 */

const PAGE_SIZE = 50;

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function mutationError(err) {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Admins only.';
    return err.message || 'Action failed.';
  }
  return 'Action failed.';
}

// Derive a URL-friendly slug from a title (lowercase, dashes, trimmed).
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const EMPTY_FORM = {
  title: '',
  slug: '',
  excerpt: '',
  cover_image_url: '',
  content: '',
  status: 'draft',
};

/* -------------------------------------------------------------------------- */
/* Editor                                                                      */
/* -------------------------------------------------------------------------- */

function BlogEditor({ token, postId, onClose, onSaved }) {
  const isEditing = postId != null;
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(isEditing);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load the existing post when editing.
  useEffect(() => {
    if (!isEditing) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const data = await api.adminBlogGet(token, postId);
        if (cancelled) return;
        const p = data.post || {};
        setForm({
          title: p.title || '',
          slug: p.slug || '',
          excerpt: p.excerpt || '',
          cover_image_url: p.cover_image_url || '',
          content: p.content || '',
          status: p.status || 'draft',
        });
      } catch (err) {
        if (!cancelled) setError(mutationError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, postId, isEditing]);

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function onTitleChange(value) {
    setForm((prev) => ({
      ...prev,
      title: value,
      // Auto-fill slug from the title until the user edits the slug manually.
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  }

  async function save() {
    if (saving) return;
    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.content.trim()) {
      setError('Content is required.');
      return;
    }
    setSaving(true);
    setError('');
    const body = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      excerpt: form.excerpt.trim() || undefined,
      cover_image_url: form.cover_image_url.trim() || undefined,
      content: form.content,
      status: form.status,
    };
    try {
      if (isEditing) await api.adminBlogUpdate(token, postId, body);
      else await api.adminBlogCreate(token, body);
      onSaved(isEditing ? 'Post updated.' : 'Post created.');
    } catch (err) {
      setError(mutationError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <Spinner size={24} />
      </div>
    );
  }

  return (
    <div className="card blog-editor">
      <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>
          {isEditing ? 'Edit post' : 'New post'}
        </div>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>
          ← Back to list
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Title</span>
          <input
            className="input"
            type="text"
            value={form.title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="How to keep your email list clean"
          />
        </label>

        <label className="field">
          <span className="field-label">Slug</span>
          <input
            className="input"
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              update('slug', e.target.value);
            }}
            placeholder="auto-generated from title"
          />
          <span className="field-hint">URL: /blog/{form.slug || 'your-post-slug'}</span>
        </label>

        <label className="field">
          <span className="field-label">Excerpt</span>
          <textarea
            className="input"
            rows={2}
            value={form.excerpt}
            onChange={(e) => update('excerpt', e.target.value)}
            placeholder="A short summary shown on the blog index and cards."
          />
        </label>

        <label className="field">
          <span className="field-label">Cover image URL</span>
          <input
            className="input"
            type="url"
            value={form.cover_image_url}
            onChange={(e) => update('cover_image_url', e.target.value)}
            placeholder="https://example.com/cover.jpg"
          />
          {form.cover_image_url.trim() && (
            <span className="blog-cover-preview">
              <img
                src={form.cover_image_url}
                alt="Cover preview"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = '';
                }}
              />
            </span>
          )}
        </label>

        <div className="field">
          <span className="field-label">
            Content <span className="field-hint" style={{ marginLeft: 6 }}>Markdown supported</span>
          </span>
          <div className="blog-editor-split">
            <textarea
              className="input blog-content-input"
              rows={18}
              value={form.content}
              onChange={(e) => update('content', e.target.value)}
              placeholder={'# Heading\n\nWrite your post in **Markdown**…\n\n- bullet\n- list\n\n[a link](https://example.com)'}
            />
            <div className="blog-editor-preview">
              <div className="blog-editor-preview-label">Preview</div>
              {form.content.trim() ? (
                <div
                  className="md-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content) }}
                />
              ) : (
                <p className="text-muted" style={{ margin: 0 }}>Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>

        <label className="field" style={{ maxWidth: 220 }}>
          <span className="field-label">Status</span>
          <select
            className="input"
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>

      <div className="blog-editor-actions">
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Spinner size={14} onDark /> : isEditing ? 'Save changes' : 'Create post'}
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* List + section                                                              */
/* -------------------------------------------------------------------------- */

function PostRow({ row, isAdmin, token, onEdit, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState(null);

  async function remove() {
    if (deleting) return;
    setDeleting(true);
    setMsg(null);
    try {
      await api.adminBlogDelete(token, row.id);
      onDeleted(row.id);
    } catch (err) {
      setMsg(mutationError(err));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <tr>
      <td className="cell-email">{row.title}</td>
      <td>
        <span className={`badge ${row.status === 'published' ? 'approved' : 'queued'}`}>
          {row.status === 'published' ? 'Published' : 'Draft'}
        </span>
      </td>
      <td className="cell-muted">{formatDate(row.published_at || row.created_at)}</td>
      <td className="pay-actions">
        <div className="pay-btns">
          <button className="btn btn-secondary btn-xs" onClick={() => onEdit(row.id)} disabled={deleting}>
            Edit
          </button>
          {isAdmin && (
            confirming ? (
              <>
                <button className="btn btn-danger btn-xs" onClick={remove} disabled={deleting}>
                  {deleting ? <Spinner size={12} /> : 'Confirm'}
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button className="btn btn-danger btn-xs" onClick={() => setConfirming(true)}>
                Delete
              </button>
            )
          )}
        </div>
        {msg && <div className="row-msg err" style={{ marginTop: 6 }}>{msg}</div>}
      </td>
    </tr>
  );
}

export default function BlogManager({ token, isAdmin }) {
  const [filter, setFilter] = useState('all'); // 'all' | 'published' | 'draft'
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // null = list view; 'new' = creating; <id> = editing.
  const [editing, setEditing] = useState(undefined); // undefined => list

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.adminBlogList(token, {
        status: filter === 'all' ? '' : filter,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setRows(data.posts || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.posts || []).length);
    } catch (err) {
      setError(mutationError(err));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, filter]);

  useEffect(() => {
    if (editing === undefined) load();
  }, [load, editing]);

  function handleSaved(message) {
    setEditing(undefined);
    setFlash(message);
    setTimeout(() => setFlash(''), 4000);
  }

  function handleDeleted(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setTotal((t) => Math.max(0, t - 1));
    setFlash('Post deleted.');
    setTimeout(() => setFlash(''), 4000);
  }

  // Editor view (create or edit).
  if (editing !== undefined) {
    return (
      <div className="mt-24">
        <BlogEditor
          token={token}
          postId={editing === 'new' ? null : editing}
          onClose={() => setEditing(undefined)}
          onSaved={handleSaved}
        />
      </div>
    );
  }

  return (
    <div className="mt-24">
      <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div className="card-title" style={{ marginBottom: 0 }}>Blog</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="seg">
            <button
              type="button"
              className={`seg-btn${filter === 'all' ? ' on' : ''}`}
              onClick={() => setFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`seg-btn${filter === 'published' ? ' on' : ''}`}
              onClick={() => setFilter('published')}
            >
              Published
            </button>
            <button
              type="button"
              className={`seg-btn${filter === 'draft' ? ' on' : ''}`}
              onClick={() => setFilter('draft')}
            >
              Drafts
            </button>
          </div>
          <button type="button" className="btn btn-primary btn-xs" onClick={() => setEditing('new')}>
            + New post
          </button>
        </div>
      </div>

      {flash && <div className="alert alert-success" style={{ marginBottom: 16 }}>{flash}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <Spinner size={24} />
        </div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📝</div>
            <h3>No posts</h3>
            <p>
              {filter === 'all'
                ? 'Create your first post to get started.'
                : `No ${filter} posts.`}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data admin-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <PostRow
                    key={row.id}
                    row={row}
                    isAdmin={isAdmin}
                    token={token}
                    onEdit={(id) => setEditing(id)}
                    onDeleted={handleDeleted}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="range">Showing {rows.length} of {total}</span>
          </div>
        </>
      )}
    </div>
  );
}
