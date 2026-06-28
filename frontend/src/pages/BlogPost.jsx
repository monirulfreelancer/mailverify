import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import Spinner from '../components/Spinner';
import { api, ApiError } from '../api';
import { renderMarkdown } from '../lib/markdown';
import '../landing.css';

/**
 * Public single blog post page (/blog/:slug). Fetches the published post,
 * renders the cover image, title, and the Markdown body as sanitized HTML.
 * Sets document.title for basic SEO and shows a friendly 404 with a link back
 * to the index when the slug doesn't resolve. The publish date is intentionally
 * hidden from public readers.
 */

const SITE = 'mailverify';

export default function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    setError('');
    setPost(null);

    (async () => {
      try {
        const data = await api.blogGetBySlug(slug);
        if (cancelled) return;
        setPost(data.post || null);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else setError(err?.message || 'Could not load this post.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // SEO: reflect the post title in the tab; restore on unmount.
  useEffect(() => {
    if (post?.title) document.title = `${post.title} — ${SITE} Blog`;
    return () => {
      document.title = SITE;
    };
  }, [post]);

  return (
    <div className="lp">
      <MarketingNav />

      <article className="lp-section blog-post">
        <div className="blog-post-inner">
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80 }}>
              <Spinner size={28} />
            </div>
          ) : notFound ? (
            <div className="blog-empty">
              <div className="blog-empty-icon" aria-hidden="true">🔍</div>
              <h3>Post not found</h3>
              <p>The post you're looking for doesn't exist or may have been moved.</p>
              <Link to="/blog" className="btn btn-secondary btn-lg" style={{ marginTop: 20 }}>
                ← Back to blog
              </Link>
            </div>
          ) : error ? (
            <>
              <div className="alert alert-error">{error}</div>
              <div style={{ marginTop: 20 }}>
                <Link to="/blog" className="lp-back-link">← Back to blog</Link>
              </div>
            </>
          ) : post ? (
            <>
              <Link to="/blog" className="lp-back-link">← Back to blog</Link>

              <header className="blog-post-header">
                <h1 className="blog-post-title">{post.title}</h1>
                {post.excerpt && <p className="blog-post-lede">{post.excerpt}</p>}
              </header>

              {post.cover_image_url && (
                <img
                  className="blog-post-cover"
                  src={post.cover_image_url}
                  alt=""
                />
              )}

              <div
                className="md-body"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
              />

              <div className="blog-post-footer">
                <Link to="/blog" className="btn btn-secondary">← Back to blog</Link>
              </div>
            </>
          ) : null}
        </div>
      </article>

      <MarketingFooter />
    </div>
  );
}
