import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Verify from './pages/Verify';
import Bulk from './pages/Bulk';
import History from './pages/History';
import ApiKeys from './pages/ApiKeys';
import Admin from './pages/Admin';

/**
 * App shell: routing + auth gating.
 *
 * - While the session is being restored, show a full-page spinner.
 * - Protected routes redirect to /login when unauthenticated.
 * - /login and /signup redirect to / when already authenticated.
 *
 * Host split: the same build serves two domains.
 * - Marketing host (goanglelead.com / www / localhost): "/" shows the Landing page.
 * - App host (app.goanglelead.com): "/" never shows Landing — it behaves like the
 *   old app ("/" -> Dashboard when authenticated, otherwise redirect to /login).
 */

// True on the app host (app.goanglelead.com). Anything not starting with "app."
// — goanglelead.com, www.goanglelead.com, localhost — is treated as marketing.
function isAppHost() {
  return window.location.hostname.startsWith('app.');
}

function FullPageLoader() {
  return (
    <div className="full-center">
      <Spinner size={28} />
    </div>
  );
}

// Wraps protected pages: renders the navbar + page, or redirects to /login.
function Protected({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <main className="page">{children}</main>
    </>
  );
}

// Wraps the admin page: authenticated AND role-gated to admin/manager.
// Normal users are redirected to "/" so they never see the admin UI.
function AdminOnly({ children }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const role = user?.role;
  if (role !== 'admin' && role !== 'manager') return <Navigate to="/" replace />;
  return (
    <>
      <Navbar />
      <main className="page">{children}</main>
    </>
  );
}

// Home ("/"): host-dependent.
// - Marketing host: always render the Landing page (regardless of auth).
// - App host: never render Landing — Dashboard when authenticated, otherwise
//   redirect to /login.
function Home() {
  const { isAuthenticated, loading } = useAuth();
  if (!isAppHost()) return <Landing />;
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <>
      <Navbar />
      <main className="page">
        <Dashboard />
      </main>
    </>
  );
}

// Wraps auth pages: redirects to dashboard if already logged in.
function PublicOnly({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (isAuthenticated) {
    const dest = location.state?.from || '/';
    return <Navigate to={dest} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnly>
            <Signup />
          </PublicOnly>
        }
      />

      <Route path="/" element={<Home />} />
      <Route
        path="/verify"
        element={
          <Protected>
            <Verify />
          </Protected>
        }
      />
      <Route
        path="/bulk"
        element={
          <Protected>
            <Bulk />
          </Protected>
        }
      />
      <Route
        path="/history"
        element={
          <Protected>
            <History />
          </Protected>
        }
      />
      <Route
        path="/api-keys"
        element={
          <Protected>
            <ApiKeys />
          </Protected>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminOnly>
            <Admin />
          </AdminOnly>
        }
      />

      {/* Unknown routes -> home (which itself redirects to /login if needed). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
