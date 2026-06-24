import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Logo from './Logo';

/**
 * Shared sticky navbar for the PUBLIC marketing pages (Landing, Features,
 * Pricing, and later Blog/Contact). It is NOT the logged-in app sidebar.
 *
 * - Internal marketing pages are react-router <Link>s (they live on the
 *   marketing host alongside this page).
 * - Auth call-to-actions (Log in / Sign up) link to the APP host with full-page
 *   <a href> the same way the rest of the marketing site does, because auth and
 *   the dashboard live on a separate domain (app.goanglelead.com).
 *
 * Styles live in src/landing.css under the "lp-" prefix.
 */

// The app (auth + dashboard) lives on a separate domain. Mirrors Landing.jsx.
const APP_URL = 'https://app.goanglelead.com';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/blog', label: 'Blog' },
  { to: '/contact', label: 'Contact' },
];

export default function MarketingNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  const isActive = (to) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const close = () => setOpen(false);

  return (
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <Link to="/" aria-label="mailverify home" onClick={close}>
          <Logo />
        </Link>

        {/* Center links — hidden on mobile (shown in the dropdown instead) */}
        <nav className="lp-nav-links" aria-label="Primary">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`lp-nav-link${isActive(l.to) ? ' active' : ''}`}
              aria-current={isActive(l.to) ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right — auth CTAs (desktop) */}
        <div className="lp-nav-actions">
          <a href={`${APP_URL}/login`} className="btn btn-ghost">
            Log in
          </a>
          <a href={`${APP_URL}/signup`} className="btn btn-primary">
            Sign up
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="lp-nav-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="lp-nav-mobile">
          <nav aria-label="Primary mobile">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={`lp-nav-mobile-link${isActive(l.to) ? ' active' : ''}`}
                aria-current={isActive(l.to) ? 'page' : undefined}
                onClick={close}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="lp-nav-mobile-actions">
            <a href={`${APP_URL}/login`} className="btn btn-secondary btn-block">
              Log in
            </a>
            <a href={`${APP_URL}/signup`} className="btn btn-primary btn-block">
              Sign up
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
