import { useEffect } from 'react';
import api from './api';
import { getUserRole } from './auth';

/**
 * Minimal auth check: require a token be present. We do not call the API here
 * to avoid adding latency to all protected pages. Pages that need role checks
 * should use useRequireAdmin or useRequireSupport which verify via API.
 */
export function useRequireAuth() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login');
    }
  }, []);
}

/**
 * Require ADMIN or OWNER. First try the local token, then verify with /users/me
 * in case the token has a missing/old role claim. If either path indicates
 * sufficient privileges, allow; otherwise redirect appropriately.
 */
export function useRequireAdmin() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login');
      return;
    }
    const localRole = getUserRole();
    const allowLocal = localRole === 'ADMIN' || localRole === 'OWNER';
    if (allowLocal) return;

    // Fallback to server-side verification
    api.get('/users/me')
      .then(res => {
        const role = (res.data?.role || '').toString().toUpperCase();
        if (!(role === 'ADMIN' || role === 'OWNER')) {
          window.location.replace('/dashboard');
        }
      })
      .catch(() => {
        // If the session is invalid, go to login
        window.location.replace('/login');
      });
  }, []);
}

/**
 * Require SUPPORT or higher. As above, verify via API if local token is inconclusive.
 */
export function useRequireSupport() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login');
      return;
    }
    const localRole = getUserRole();
    const allowLocal = localRole === 'SUPPORT' || localRole === 'ADMIN' || localRole === 'OWNER';
    if (allowLocal) return;

    api.get('/users/me')
      .then(res => {
        const role = (res.data?.role || '').toString().toUpperCase();
        if (!(role === 'SUPPORT' || role === 'ADMIN' || role === 'OWNER')) {
          window.location.replace('/dashboard');
        }
      })
      .catch(() => {
        window.location.replace('/login');
      });
  }, []);
}