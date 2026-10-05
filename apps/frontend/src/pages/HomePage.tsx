import { useQuery } from '@tanstack/react-query';
import { Play, Plus, Info } from 'lucide-react';
import { api } from '../services/api';
import { anilistApi } from '../services/anilist';
import { AnimeCard, AnimeRail } from '../components/ui/AnimeCard';
import { useAuthStore } from '../store/useAuthStore';

function currentSeason(): 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL' {
  const month = new Date().getMonth() + 1;
  if (month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'FALL';
}

type HistoryItem = { animeId: number; episode: number; position: number; completed: boolean };

export default function HomePage() {
  const user = useAuthStore((state) => state.user);
  const season = currentSeason();
  const year = new Date().getFullYear();

  const seasonal = useQuery({
    queryKey: ['home', 'seasonal', season, year],
    queryFn: () => anilistApi.seasonal(season, year, 1, 18),
    staleTime: 30 * 60 * 1000,
  });

  const history = useQuery({
    queryKey: ['history', 'home'],
    queryFn: async () => (await api.get<{ success: boolean; data: HistoryItem[] }>('/api/user/history')).data.data,
    staleTime: 60 * 1000,
  });

  const featured = seasonal.data?.Page.media?.[0];
  const rail = seasonal.data?.Page.media?.slice(1, 13) ?? [];

  return (
    <div className="kuro-page">
      <div className="kuro-container">
        <section className="kuro-hero" aria-label="Featured premiere">
          {featured && (
            <div className="kuro-hero-media">
              <img src={featured.bannerImage || featured.coverImage.extraLarge || featured.coverImage.large} alt="" />
            </div>
          )}
          <div className="kuro-hero-overlay" />
          <div className="kuro-hero-content">
            <div className="kuro-eyebrow">FEATURED PREMIERE</div>
            <h1>{featured?.title.userPreferred ?? 'Kuro'}</h1>
            <p>{featured?.description?.replace(/<[^>]*>/g, '').slice(0, 300) ?? 'A focused anime streaming experience built around discovery, momentum, and cinematic playback.'}</p>
            <div className="kuro-meta-row">
              <strong>{featured?.status?.replaceAll('_', ' ') ?? 'RELEASING'}</strong>
              <span>•</span>
              <span>{featured?.episodes ?? '—'} episodes</span>
              <span>•</span>
              <span>Sub / Dub</span>
              {featured?.averageScore ? <><span>•</span><span>{(featured.averageScore / 10).toFixed(1)} score</span></> : null}
            </div>
            <div className="kuro-hero-actions">
              {featured ? <a className="kuro-button kuro-button-primary" href={'/watch/' + featured.id + '/1'}><Play size={16} fill="currentColor" /> Play</a> : null}
              {featured ? <a className="kuro-button" href={'/anime/' + featured.id}><Info size={16} /> More info</a> : null}
            </div>
          </div>
        </section>

        <section className="kuro-section">
          <div className="kuro-section-head">
            <div><div className="kuro-eyebrow">MOMENTUM</div><h2>Continue Watching</h2></div>
            <a className="kuro-text-link" href="/history">Open history</a>
          </div>
          {(history.data ?? []).length === 0 ? (
            <div className="kuro-page-note">Returning users see Continue Watching first. Start a title to make this lane personal.</div>
          ) : (
            <div className="kuro-card-grid">
              {history.data.slice(0, 6).map((item) => ({
                item,
                href: '/watch/' + item.animeId + '/' + item.episode,
              })).map(({ item, href }) => (
                <article key={item.animeId + '-' + item.episode} className="kuro-card">
                  <a href={href} className="block" style={{ padding: 18 }}>
                    <div className="kuro-eyebrow">EPISODE {item.episode}</div>
                    <h3 style={{ margin: 0, fontSize: 14 }}>Continue your story</h3>
                    <p className="kuro-history-meta">{item.completed ? 'Completed' : Math.round(item.position / 60) + ' min watched'}</p>
                    <div className="kuro-progress"><span style={{ width: item.completed ? '100%' : Math.min(92, Math.max(7, item.position / 15)) + '%' }} /></div>
                    <div className="kuro-small-button kuro-small-button-primary" style={{ marginTop: 14 }}><Play size={13} fill="currentColor" /> Resume</div>
                  </a>
                </article>
              ))}
            </div>
          )}
        </section>

        <AnimeRail title="New releases" eyebrow={'OBSIDIAN / 02'} items={rail.slice(0, 6)} />
        <AnimeRail title="Trending" items={rail.slice(6, 12)} />
        <section className="kuro-section">
          <div className="kuro-section-head">
            <div><div className="kuro-eyebrow">MY LIST</div><h2>Save titles for later</h2></div>
            <a className="kuro-text-link" href="/watchlist">Open My List</a>
          </div>
          <div className="kuro-page-note"><Plus size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} /> Saved titles become a calm, sortable library with no visual noise.</div>
        </section>
      </div>
    </div>
  );
}
