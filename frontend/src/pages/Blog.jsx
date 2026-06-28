import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import Spinner from '../components/Spinner';
import { api } from '../api';
import '../landing.css';

/**
 * Public marketing "Blog" page (served on the marketing host, like Features /
 * Pricing). Lists published posts in a responsive grid of cards and supports
 * "load more" pagination when there are more posts than the page size.
 */

const PAGE_SIZE = 12;

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function PostCard({ post }) {
  return (
    <Link to={`/blog/${post.slug}`} className="blog-card">
      <div className="blog-card-media">
        {post.cover_image_url ? (
          <img src={post.cover_image_url} alt="" loading="lazy" />
        ) : (
          <div className="blog-card-media-fallback" aria-hidden="true">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </div>
        )}
      </div>
      <div className="blog-card-body">
        {post.published_at && (
          <span className="blog-card-date">{formatDate(post.published_at)}</span>
        )}
        <h3 className="blog-card-title">{post.title}</h3>
        {post.excerpt && <p className="blog-card-excerpt">{post.excerpt}</p>}
        <span className="blog-card-readmore">Read more →</span>
      </div>
    </Link>
  );
}

export default function Blog() {
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);   // initial load
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Blog — mailverify';
  }, []);

  const load = useCallback(async (nextOffset) => {
    const initial = nextOffset === 0;
    if (initial) setLoading(true);
    else setLoadingMore(true);
    setError('');
    try {
      const data = await api.blogList({ limit: PAGE_SIZE, offset: nextOffset });
      const batch = data.posts || [];
      setPosts((prev) => (initial ? batch : [...prev, ...batch]));
      setTotal(typeof data.total === 'number' ? data.total : batch.length);
      setOffset(nextOffset + batch.length);
    } catch (err) {
      setError(err?.message || 'Could not load posts. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const hasMore = posts.length < total;

  return (
    <div className="lp">
      <MarketingNav />

      {/* ---------- Hero ---------- */}
      <section className="lp-section lp-page-hero">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Blog</span>
            <h1 className="lp-page-title">
              Deliverability <span className="lp-grad">guides & updates</span>
            </h1>
            <p>
              Practical tips on email verification, list hygiene, and protecting
              your sender reputation — plus the latest from the mailverify team.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Posts ---------- */}
      <section className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-container">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spinner size={28} />
            </div>
          ) : error ? (
            <div className="alert alert-error">{error}</div>
          ) : posts.length === 0 ? (
            <div className="blog-empty">
              <div className="blog-empty-icon" aria-hidden="true">📝</div>
              <h3>No posts yet</h3>
              <p>We're working on our first articles — check back soon.</p>
            </div>
          ) : (
            <>
              <div className="blog-grid">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: 36 }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    onClick={() => load(offset)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? <Spinner size={16} /> : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
