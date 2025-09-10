import { useEffect } from 'react';
import { getUserRole } from './auth';

export function useRequireAuth() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/login');
    }
  }, []);
}

export function useRequireAdmin() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    const role = getUserRole();
    if (!token) {
      window.location.replace('/login');
      return;
    }
    if (!(role === 'ADMIN' || role === 'OWNER')) {
      window.location.replace('/dashboard');
    }
  }, []);
}