import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Spinner from './components/Spinner';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Landing from './pages/Landing';
import Verify from './pages/Verify';
import History from './pages/History';
import ApiKeys from './pages/ApiKeys';

/**
 * App shell: routing + auth gating.
 *
 * - While the session is being restored, show a full-page spinner.
 * - Protected routes redirect to /login when unauthenticated.
 * - /login and /signup redirect to / when already authenticated.
 */

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

// Home ("/"): marketing Landing page for logged-out visitors, Dashboard for
// authenticated users. Replaces the old behavior of redirecting "/" to /login.
function Home() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!isAuthenticated) return <Landing />;
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

      {/* Unknown routes -> home (which itself redirects to /login if needed). */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
