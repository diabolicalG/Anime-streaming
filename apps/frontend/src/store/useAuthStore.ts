import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../services/api';
import type { UserPreferences } from '../types/api';

interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
  role: string;
  preferences?: UserPreferences;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      
      login: async (email, password) => {
        const { data } = await api.post('/api/auth/login', { email, password });
        set({ user: data.data.user, isAuthenticated: true });
      },
      
      register: async (email, username, password) => {
        const { data } = await api.post('/api/auth/register', { email, username, password });
        set({ user: data.data.user, isAuthenticated: true });
      },
      
      logout: async () => {
        await api.post('/api/auth/logout');
        set({ user: null, isAuthenticated: false });
      },
      
      fetchMe: async () => {
        try {
          const { data } = await api.get('/api/auth/me');
          set({ user: data.data.user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },

      setUser: (user) => set({ user, isAuthenticated: !!user }),
    }),
    { 
      name: 'auth-storage', 
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }) 
    }
  )
);
