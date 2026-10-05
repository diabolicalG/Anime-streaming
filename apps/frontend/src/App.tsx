import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { KuroShell } from './components/layout/KuroShell';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SearchPage from './pages/SearchPage';
import BrowsePage from './pages/BrowsePage';
import SeasonalPage from './pages/SeasonalPage';
import AnimeDetailPage from './pages/AnimeDetailPage';
import WatchPage from './pages/WatchPage';
import HistoryPage from './pages/HistoryPage';
import WatchlistPage from './pages/WatchlistPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <div className="kuro-page-note" style={{ margin: 24 }}>Loading…</div>;
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  if (isLoading) return <div className="kuro-page-note" style={{ margin: 24 }}>Loading…</div>;
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
};

function ProtectedShell() {
  return <KuroShell><Outlet /></KuroShell>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route element={<ProtectedRoute><ProtectedShell /></ProtectedRoute>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/browse" element={<BrowsePage />} />
        <Route path="/seasonal" element={<SeasonalPage />} />
        <Route path="/anime/:anilistId" element={<AnimeDetailPage />} />
        <Route path="/watch/:anilistId/:episode" element={<WatchPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
