import { Link } from 'react-router-dom';
import Logo from './Logo';

/**
 * Shared footer for the PUBLIC marketing pages. Product/Company links route to
 * the marketing pages with react-router <Link>s; Legal links are placeholders
 * ("#") until those pages exist.
 *
 * Styles live in src/landing.css under the "lp-" prefix.
 */
export default function MarketingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div>
            <Logo />
            <p className="lp-footer-tagline">
              Real-time email verification that keeps your lists clean and your sender
              reputation strong.
            </p>
          </div>
          <div className="lp-footer-col">
            <h4>Product</h4>
            <ul>
              <li><Link to="/features">Features</Link></li>
              <li><Link to="/pricing">Pricing</Link></li>
              <li><Link to="/">Home</Link></li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>Company</h4>
            <ul>
              <li><Link to="/blog">Blog</Link></li>
              <li><Link to="/contact">Contact</Link></li>
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Terms</a></li>
              <li><a href="#">Security</a></li>
            </ul>
          </div>
        </div>
        <div className="lp-footer-bottom">
          © {new Date().getFullYear()} mailverify. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
