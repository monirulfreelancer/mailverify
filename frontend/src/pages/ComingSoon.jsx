import { Link } from 'react-router-dom';
import MarketingNav from '../components/MarketingNav';
import MarketingFooter from '../components/MarketingFooter';
import '../landing.css';

/**
 * Lightweight placeholder for marketing pages that aren't built yet
 * (e.g. /blog, /contact). Keeps the nav links from dead-ending while the real
 * pages get wired up. Pass a `title` and optional `subtitle`.
 */
export default function ComingSoon({ title = 'Coming soon', subtitle }) {
  return (
    <div className="lp">
      <MarketingNav />

      <section className="lp-section lp-page-hero">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-eyebrow">Coming soon</span>
            <h1 className="lp-page-title">{title}</h1>
            <p>{subtitle || "We're putting the finishing touches on this page. Check back soon."}</p>
            <div style={{ marginTop: 28 }}>
              <Link to="/" className="btn btn-secondary btn-lg">
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
