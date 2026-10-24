// src/hooks/useAuth.jsx
// Session + profile (nama, role) dari Supabase Auth + tabel profiles

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null);
  const [profile, setProfile]   = useState(null);
  const [loading, setLoading]   = useState(true);

  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama, email, role, aktif')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('[useAuth] fetchProfile error:', error);
      return null;
    }
    return data;
  }

  useEffect(() => {
    // Ambil session awal
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      }
      setLoading(false);
    });

    // Subscribe perubahan auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session);
      if (session?.user) {
        const p = await fetchProfile(session.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }

  const isSuperAdmin = profile?.role === 'super_admin';
  const isAdmin      = profile?.role === 'admin' || isSuperAdmin;
  const isPetugas    = profile?.role === 'petugas' || isAdmin;

  return (
    <AuthContext.Provider value={{ session, profile, loading, isSuperAdmin, isAdmin, isPetugas, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Guard component: hanya render children jika role sesuai.
 * @param {{ roles: string[], children: React.ReactNode }} props
 */
export function RequireRole({ roles, children, fallback = null }) {
  const { profile } = useAuth();
  if (!profile || !roles.includes(profile.role)) return fallback;
  return children;
}
