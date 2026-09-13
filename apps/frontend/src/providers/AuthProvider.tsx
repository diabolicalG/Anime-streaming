import { useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { fetchMe, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchMe();
    }
  }, [isAuthenticated, fetchMe]);

  return <>{children}</>;
}
