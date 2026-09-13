import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import SeasonalPage from './pages/SeasonalPage';
import AnimeDetailPage from './pages/AnimeDetailPage';
import WatchPage from './pages/WatchPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
};

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
        
        <Route element={<ProtectedRoute><HomePage /></ProtectedRoute>}>
          <Route path="/" element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="browse" element={<BrowsePage />} />
          <Route path="seasonal" element={<SeasonalPage />} />
          <Route path="anime/:anilistId" element={<AnimeDetailPage />} />
          <Route path="watch/:anilistId/:episode" element={<WatchPage />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
