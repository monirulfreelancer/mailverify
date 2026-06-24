import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from './Logo';

/**
 * Top navigation shown on authenticated pages: logo, page links, a credit
 * balance pill, and a logout button.
 */

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/verify', label: 'Verify' },
  { to: '/bulk', label: 'Bulk' },
  { to: '/history', label: 'History' },
  { to: '/api-keys', label: 'API Keys' },
];

export default function Navbar() {
  const { credits, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" style={{ textDecoration: 'none' }}>
          <Logo />
        </NavLink>

        <nav className="nav-links">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-right">
          {credits !== null && credits !== undefined && (
            <span className="credit-pill" title="Remaining credits">
              <span className="dot" />
              {credits.toLocaleString()} credits
            </span>
          )}
          <button className="btn btn-ghost" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
