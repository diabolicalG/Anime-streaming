import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const history = useQuery({
    queryKey: ['history', 'profile'],
    queryFn: async () => (await api.get('/api/user/history')).data.data as Array<{ position: number }>,
  });
  const watchTime = (history.data ?? []).reduce((sum, item) => sum + item.position, 0);

  return (
    <div className="kuro-container kuro-page">
      <div className="kuro-eyebrow">OBSIDIAN / 09</div>
      <h1 className="kuro-page-title">Profile</h1>
      <p className="kuro-page-copy">Identity, taste, and momentum in one dashboard—useful at a glance, private by default, and never gamified.</p>

      <section className="kuro-section kuro-profile-grid">
        <div className="kuro-data-panel">
          <div className="kuro-toolbar">
            <div>
              <div className="kuro-eyebrow">ACCOUNT</div>
              <h2>{user?.username ?? 'Member'}</h2>
            </div>
          </div>
          <div style={{ padding: 20 }}>
            <p className="kuro-history-meta">Member since {user ? (user?.createdAt ? new Date(user.createdAt).getFullYear() : '—') : '—'} · {user?.email ?? ''}</p>
            <div className="kuro-stat-grid" style={{ marginTop: 18 }}>
              <div className="kuro-stat"><strong>{history.data?.length ?? 0}</strong><span>episodes watched</span></div>
              <div className="kuro-stat"><strong>{Math.round(watchTime / 3600)}h</strong><span>watch time</span></div>
              <div className="kuro-stat"><strong>3</strong><span>taste pillars</span></div>
            </div>
          </div>
        </div>
        <div className="kuro-data-panel">
          <div className="kuro-toolbar">
            <div>
              <div className="kuro-eyebrow">YOUR TASTE</div>
              <h2>Drama · Mystery · Sci-fi</h2>
            </div>
          </div>
          <div className="kuro-page-note" style={{ margin: 20 }}>Taste summaries stay descriptive. They do not turn viewing into a score or streak.</div>
        </div>
      </section>
    </div>
  );
}
