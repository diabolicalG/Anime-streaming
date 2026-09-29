import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchMe, login } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      // DEV-ONLY auto-login. Gated by import.meta.env.DEV so it
      // can never run in a production build. Credentials come
      // from .env.local (gitignored).
      if (
        import.meta.env.DEV &&
        import.meta.env.VITE_DEV_AUTOLOGIN === 'true'
      ) {
        const email = import.meta.env.VITE_DEV_AUTOLOGIN_EMAIL;
        const password = import.meta.env.VITE_DEV_AUTOLOGIN_PASSWORD;
        if (email && password) {
          try {
            await login(email, password);
          } catch {
            // Ignore — fetchMe below will reconcile state.
          }
        }
      }
      await fetchMe();
    };
    initAuth();
  }, [fetchMe, login]);

  return <>{children}</>;
}