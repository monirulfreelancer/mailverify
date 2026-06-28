import { Routes, Route, Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/AppLayout';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Features from './pages/Features';
import Pricing from './pages/Pricing';
import Contact from './pages/Contact';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Verify from './pages/Verify';
import Bulk from './pages/Bulk';
import History from './pages/History';
import ApiKeys from './pages/ApiKeys';
import BuyCredits from './pages/BuyCredits';
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

// Layout route for protected pages: renders the sidebar shell (AppLayout) with
// the routed page inside its <Outlet />, or redirects to /login.
// When `adminOnly` is set, the page is additionally role-gated to admin/manager
// and normal users are redirected to "/" so they never see the admin UI.
function ProtectedLayout({ adminOnly = false }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly) {
    const role = user?.role;
    if (role !== 'admin' && role !== 'manager') return <Navigate to="/" replace />;
  }
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
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
    <AppLayout>
      <Dashboard />
    </AppLayout>
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

      {/* Public marketing pages — no auth, no sidebar. They render on every host
          (the marketing site is the intended audience; on the app host they
          simply remain publicly viewable). */}
      <Route path="/features" element={<Features />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/blog/:slug" element={<BlogPost />} />
      <Route path="/contact" element={<Contact />} />

      {/* Authenticated pages share the sidebar shell (AppLayout). */}
      <Route element={<ProtectedLayout />}>
        <Route path="/verify" element={<Verify />} />
        <Route path="/bulk" element={<Bulk />} />
        <Route path="/history" element={<History />} />
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="/buy-credits" element={<BuyCredits />} />
      </Route>

      {/* Admin/manager only — same shell, role-gated. */}
      <Route element={<ProtectedLayout adminOnly />}>
        <Route path="/admin" element={<Admin />} />
      </Route>

      {/* Unknown routes -> home (which itself redirects to /login if needed). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
