import { useState, useCallback } from 'react';
import { NavLink, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

/**
 * AppLayout — the persistent shell for all authenticated pages.
 *
 * Left sidebar (logo, credits block, "Buy Credits", nav menu) + a top bar
 * (user identity + log out) + the routed page in the main content area.
 *
 * Renders `children` when given (used by the host-dependent "/" route) and
 * otherwise an <Outlet /> for layout routes.
 *
 * Fully responsive: below 900px the sidebar becomes an off-canvas drawer
 * toggled by the hamburger in the top bar.
 */

// --- Inline icons (stroke-based, 20px) -------------------------------------
function Icon({ path, fill = false }) {
  return (
    <svg
      className="nav-ico"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const ICONS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  verify: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  bulk: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  keys: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.8 12.2 8-8" />
      <path d="m17 4 3 3" />
      <path d="m14 7 2.5 2.5" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3 4 6v5c0 5 3.4 8.3 8 10 4.6-1.7 8-5 8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
};

// Base nav items shown to every authenticated user.
const NAV = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
  { to: '/verify', label: 'Single Verify', icon: 'verify' },
  { to: '/bulk', label: 'Bulk Verify', icon: 'bulk' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/api-keys', label: 'API Keys', icon: 'keys' },
];

export default function AppLayout({ children }) {
  const { credits, user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState(null); // string | null

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const isStaff = user?.role === 'admin' || user?.role === 'manager';
  const links = isStaff
    ? [...NAV, { to: '/admin', label: 'Admin', icon: 'admin' }]
    : NAV;

  const creditLabel =
    credits === null || credits === undefined ? '—' : credits.toLocaleString();
  const identity = user?.name || user?.email || 'Account';

  return (
    <div className="app-shell">
      {/* Backdrop for the mobile drawer */}
      <div
        className={`app-backdrop${drawerOpen ? ' show' : ''}`}
        onClick={closeDrawer}
        aria-hidden="true"
      />

      {/* ---------------- Sidebar ---------------- */}
      <aside className={`sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <NavLink to="/" className="sidebar-logo" onClick={closeDrawer}>
            <Logo />
          </NavLink>
          <button
            className="sidebar-close"
            onClick={closeDrawer}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* Credits block */}
        <div className="credits-block">
          <div className="credits-label">Available credit</div>
          <div className="credits-value">{creditLabel}</div>
          <div className="credits-caption">Validity: Lifetime</div>
          <button
            className="btn btn-primary btn-block"
            onClick={() => setComingSoon('buy')}
          >
            Buy Credits
          </button>
        </div>

        {/* Nav menu */}
        <nav className="side-nav">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              onClick={closeDrawer}
              className={({ isActive }) =>
                `side-nav-link${isActive ? ' active' : ''}`
              }
            >
              <Icon path={ICONS[l.icon]} />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ---------------- Body ---------------- */}
      <div className="app-body">
        <header className="app-topbar">
          <button
            className="hamburger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <span />
            <span />
            <span />
          </button>

          <div className="topbar-right">
            <button
              className="btn btn-ghost btn-sm refer-btn"
              onClick={() => setComingSoon('refer')}
            >
              🎁 Refer &amp; Earn
            </button>
            <span className="topbar-user" title={identity}>
              <span className="topbar-avatar" aria-hidden="true">
                {identity.charAt(0).toUpperCase()}
              </span>
              <span className="topbar-email">{identity}</span>
            </span>
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <main className="app-content" key={location.pathname}>
          {children || <Outlet />}
        </main>
      </div>

      {/* ---------------- "Coming soon" modal ---------------- */}
      {comingSoon && (
        <div className="modal-overlay" onClick={() => setComingSoon(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-emoji" aria-hidden="true">
              {comingSoon === 'buy' ? '💳' : '🎁'}
            </div>
            <h3>
              {comingSoon === 'buy' ? 'Buy Credits' : 'Refer & Earn'}
            </h3>
            <p>
              Coming soon — {comingSoon === 'buy'
                ? 'payments are launching shortly. You’ll be able to top up your balance right here.'
                : 'invite friends and earn free credits. This program is launching soon.'}
            </p>
            <button
              className="btn btn-primary btn-block"
              onClick={() => setComingSoon(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
