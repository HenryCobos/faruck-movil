import { create } from 'zustand';
import { Session } from '@supabase/supabase-js';
import { Profile } from '../types';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  fetchProfile: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  profile: null,
  loading: true,

  setSession: (session) => set({ session }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  fetchProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && data) {
        const profile = data as Profile;
        if (profile.activo === false) {
          // Usuario desactivado — cerrar sesión inmediatamente
          await supabase.auth.signOut();
          set({ session: null, profile: null });
          return;
        }
        set({ profile });
      }
    } catch {
      // Network error — profile stays null, user can still navigate the app
    }
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, profile: null });
  },

  reset: () => set({ session: null, profile: null, loading: false }),
}));
