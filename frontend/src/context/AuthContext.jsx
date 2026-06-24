import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, ApiError } from '../api';

/**
 * AuthContext — holds the JWT + current user, and exposes login/signup/logout.
 *
 * The token lives in memory (React state) and is mirrored to localStorage so a
 * page refresh can restore the session. On any 401 from an authenticated call,
 * components should call `logout()` (the api layer throws ApiError with
 * status 401, which we also handle centrally in `authedCall`).
 */

const TOKEN_KEY = 'mv_token';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(null);
  // `loading` is true while we restore the session on first load.
  const [loading, setLoading] = useState(true);

  // Persist the token to localStorage whenever it changes.
  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setCredits(null);
  }, []);

  // Restore the session on mount (and whenever the token changes externally).
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await api.me(token);
        if (cancelled) return;
        // /auth/me returns { user, credits }
        setUser(data.user || null);
        setCredits(typeof data.credits === 'number' ? data.credits : null);
      } catch (err) {
        if (cancelled) return;
        // Invalid/expired token -> drop it.
        if (err instanceof ApiError && err.status === 401) logout();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    restore();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = useCallback(async (email, password) => {
    const data = await api.login(email, password);
    setToken(data.token);
    setUser(data.user || null);
    return data;
  }, []);

  const signup = useCallback(async (email, password) => {
    const data = await api.signup(email, password);
    setToken(data.token);
    setUser(data.user || null);
    return data;
  }, []);

  // Refresh the credit balance (e.g. after a verification).
  const refreshCredits = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.credits(token);
      setCredits(typeof data.credits === 'number' ? data.credits : null);
    } catch {
      /* non-critical */
    }
  }, [token]);

  const value = {
    token,
    user,
    credits,
    loading,
    isAuthenticated: !!token,
    login,
    signup,
    logout,
    refreshCredits,
    setCredits,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
