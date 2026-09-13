import { useAuthStore } from '../store/useAuthStore';

export function useAuth() {
  const { user, isAuthenticated, isLoading, login, register, logout, fetchMe } = useAuthStore();
  
  return {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    fetchMe,
  };
}
