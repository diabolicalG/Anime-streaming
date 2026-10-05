import { ReactNode, FormEvent } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Home, Compass, List, Search, UserCircle, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/useAuthStore';

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/browse', label: 'Browse', icon: Compass },
  { to: '/watchlist', label: 'My List', icon: List },
];

export function KuroShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = String(form.get('q') ?? '').trim();
    if (q.length >= 2) navigate('/search?q=' + encodeURIComponent(q));
  };

  return (
    <div className="kuro-app">
      <header className="kuro-topbar">
        <Link to="/" className="kuro-brand" aria-label="Kuro home">KURO</Link>
        <nav className="kuro-nav kuro-nav-desktop" aria-label="Primary">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'kuro-nav-link is-active' : 'kuro-nav-link'}>
              <Icon size={16} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <form className="kuro-search" onSubmit={submitSearch}>
          <Search size={16} aria-hidden="true" />
          <input name="q" aria-label="Search anime" placeholder="Search anime" />
        </form>
        <div className="kuro-user-actions">
          <NavLink to="/profile" className="kuro-icon-button" aria-label="Profile">
            <UserCircle size={19} />
          </NavLink>
          <NavLink to="/settings" className="kuro-icon-button" aria-label="Settings">
            <Settings size={18} />
          </NavLink>
          {user && (
            <button type="button" className="kuro-avatar" onClick={() => void logout()} title="Sign out" aria-label="Sign out">
              <span>{user.username.slice(0, 1).toUpperCase()}</span>
              <LogOut size={12} />
            </button>
          )}
        </div>
      </header>
      <main className="kuro-main">{children}</main>
      <nav className="kuro-mobile-nav" aria-label="Mobile">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'kuro-mobile-link is-active' : 'kuro-mobile-link'}>
            <Icon size={19} />
            <span>{label}</span>
          </NavLink>
        ))}
        <NavLink to="/profile" className={({ isActive }) => isActive ? 'kuro-mobile-link is-active' : 'kuro-mobile-link'}>
          <UserCircle size={19} />
          <span>Profile</span>
        </NavLink>
      </nav>
    </div>
  );
}
