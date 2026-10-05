import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { anilistApi } from '../services/anilist';
import { api } from '../services/api';
import { usePlayerStore } from '../store/usePlayerStore';
import type { AniListMedia } from '../types/anilist';
import type { StreamSource } from '../types/streaming';
import { VideoPlayer } from '../components/player/VideoPlayer';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { formatNumber } from '../utils/format';

export default function AnimeDetailPage() {
  const { anilistId } = useParams<{ anilistId: string }>();
  const id = parseInt(anilistId || '0', 10);
  const navigate = useNavigate();
  const { setSources, currentSource, selectSource, subtitles, currentSubtitle, selectSubtitle, setCurrentTime } = usePlayerStore();
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);

  const { data: anime, isLoading, error } = useQuery<AniListMedia>({
    queryKey: ['anime', 'detail', id],
    queryFn: async () => {
      const { Media } = await anilistApi.detail(id);
      return Media;
    },
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
  });

  const { data: recommendations } = useQuery<AniListMedia[]>({
    queryKey: ['anime', 'recommendations', id],
    queryFn: async () => {
      const { Media } = await anilistApi.recommendations(id);
      return Media.recommendations.nodes.map((node: { mediaRecommendation: AniListMedia; rating?: number }) => ({
        ...node.mediaRecommendation,
        recommendationRating: node.rating,
      }));
    },
    enabled: !!id,
    staleTime: 60 * 60 * 1000,
  });

  const { data: sources } = useQuery({
    queryKey: ['episodeSources', 'anilist', id, selectedEpisode],
    queryFn: async () => {
      if (!selectedEpisode) return [];
      const { data } = await api.get<{ success: boolean; data: StreamSource[] }>(
        '/api/anime/anilist/' + id + '/episodes/' + selectedEpisode
      );
      return data.data;
    },
    enabled: !!selectedEpisode,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (sources && !currentSource) {
      setSources(sources);
    }
  }, [sources, currentSource, setSources]);

  const handleEpisodeSelect = (episode: number) => {
    setSelectedEpisode(episode);
    setShowPlayer(true);
  };

  const handleClosePlayer = () => {
    setShowPlayer(false);
    setSelectedEpisode(null);
  };

  const handleRecommendationClick = (rec: AniListMedia) => {
    navigate('/anime/' + rec.id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Anime Not Found</h2>
          <p className="text-gray-400 mb-6">Unable to load anime details.</p>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const totalEpisodes = anime.episodes || 0;

  return (
    <div className="kuro-container kuro-page">
      {showPlayer && selectedEpisode && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-90 flex items-center justify-center p-4">
          <div className="relative w-full max-w-5xl aspect-video max-h-[90vh]">
            <VideoPlayer
              source={currentSource}
              subtitles={subtitles}
              onEnded={handleClosePlayer}
              onTimeUpdate={setCurrentTime}
            />
            <div className="absolute top-4 right-4 z-10">
              <Button variant="ghost" onClick={handleClosePlayer} className="bg-gray-900/80 text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Button>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-gray-900/90 rounded-lg p-2 flex items-center gap-4">
              <select
                value={currentSource?.quality || 'auto'}
                onChange={(e) => {
                  const source = sources?.find(s => s.quality === e.target.value);
                  if (source) selectSource(source);
                }}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
              >
                {sources?.map(s => (
                  <option key={s.quality} value={s.quality}>{s.quality}</option>
                ))}
              </select>
              {subtitles.length > 0 && (
                <select
                  value={currentSubtitle?.lang || 'off'}
                  onChange={(e) => {
                    const sub = subtitles.find(s => s.lang === e.target.value);
                    selectSubtitle(sub || null);
                  }}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-1 text-sm"
                >
                  <option value="off">Subtitles: Off</option>
                  {subtitles.map(s => (
                    <option key={s.lang} value={s.lang}>{s.label}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-950">
        <div>
          {/* Back button */}
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6">
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Button>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-3 space-y-8">
              {/* Hero Section */}
              <div className="relative aspect-[16/9] rounded-xl overflow-hidden">
                {anime.bannerImage && (
                  <img
                    src={anime.bannerImage}
                    alt={anime.title.romaji}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent"></div>
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-bold mb-2">{anime.title.romaji}</h1>
                      <p className="text-gray-300 text-sm md:text-base">
                        {anime.title.english && <span className="mr-4">{anime.title.english}</span>}
                        {anime.title.native && <span>{anime.title.native}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      {anime.averageScore && (
                        <div className="flex items-center gap-2 bg-gray-900/80 px-4 py-2 rounded-lg">
                          <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          <span className="text-xl font-bold">{anime.averageScore}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoItem label="Status" value={anime.status} />
                <InfoItem label="Format" value={anime.format} />
                <InfoItem label="Episodes" value={anime.episodes ? anime.episodes.toString() : 'Unknown'} />
                <InfoItem label="Duration" value={anime.duration ? anime.duration + ' min/ep' : 'Unknown'} />
                <InfoItem label="Season" value={anime.season ? anime.season + ' ' + anime.seasonYear : 'Unknown'} />
                <InfoItem label="Genres" value={anime.genres.join(', ')} />
                <InfoItem label="Studios" value={anime.studios?.nodes.map(s => s.name).join(', ') || 'Unknown'} />
                <InfoItem label="Aired" value={formatAiredDate(anime.startDate, anime.endDate)} />
              </div>

              {/* Description */}
              <div className="prose prose-invert max-w-none">
                <h2 className="text-xl font-semibold mb-3">Synopsis</h2>
                <div className="text-gray-300 whitespace-pre-line">
                  {anime.description?.replace(/<[^>]*>/g, '') || 'No description available.'}
                </div>
              </div>

              {/* Episodes List */}
              {anime.episodes && anime.episodes > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold">Episodes ({anime.episodes})</h2>
                    <Button 
                      variant={selectedEpisode ? 'ghost' : 'primary'} 
                      onClick={() => handleEpisodeSelect(1)}
                      className="w-full md:w-auto"
                    >
                      {selectedEpisode ? 'Play Latest' : 'Play from Beginning'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-h-96 overflow-y-auto pr-2">
                    {Array.from({ length: totalEpisodes }, (_, i) => i + 1).map(ep => (
                      <Button
                        key={ep}
                        variant={selectedEpisode === ep ? 'primary' : 'ghost'}
                        size="sm"
                        className="w-full justify-start px-3 py-2"
                        onClick={() => handleEpisodeSelect(ep)}
                      >
                        Ep {ep}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {recommendations && recommendations.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Recommendations</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {recommendations.slice(0, 10).map((rec) => (
                      <RecommendationCard key={rec.id} anime={rec} onClick={handleRecommendationClick} />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar - Cover Image */}
            <div className="space-y-6">
              <Card className="overflow-hidden">
                <img
                  src={anime.coverImage?.large || anime.coverImage?.medium}
                  alt={anime.title.romaji}
                  className="w-full aspect-[2/3] object-cover"
                />
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-2">{anime.title.romaji}</h3>
                  <div className="space-y-2 text-sm text-gray-400">
                    <p><span className="font-medium text-white">English:</span> {anime.title.english || 'N/A'}</p>
                    <p><span className="font-medium text-white">Native:</span> {anime.title.native}</p>
                    <p><span className="font-medium text-white">Status:</span> {anime.status}</p>
                    <p><span className="font-medium text-white">Episodes:</span> {anime.episodes || 'Unknown'}</p>
                    <p><span className="font-medium text-white">Score:</span> {anime.averageScore || 'N/A'}</p>
                    <p><span className="font-medium text-white">Popularity:</span> #{formatNumber(anime.popularity || 0)}</p>
                  </div>
                </div>
              </Card>

              <Button 
                className="w-full"
                onClick={() => handleEpisodeSelect(1)}
                disabled={!anime.episodes}
              >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004.23 4.12L2 5.73V14.27L4.23 15.87A1.5 1.5 0 006.3 17.16V2.84z" />
                  <path d="M14.7 2.841A1.5 1.5 0 0116.77 4.12L19 5.73V14.27L16.77 15.87A1.5 1.5 0 0114.7 17.16V2.84z" />
                </svg>
                Play from Beginning
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-sm text-white font-medium">{value}</p>
    </div>
  );
}

function RecommendationCard({ anime, onClick }: { anime: AniListMedia; onClick: (anime: AniListMedia) => void }) {
  return (
    <Card className="cursor-pointer hover:scale-105 transition-transform duration-200 group" onClick={() => onClick(anime)}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-t-xl">
        <img
          src={anime.coverImage?.large || anime.coverImage?.medium}
          alt={anime.title.romaji}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <span className="text-xs text-gray-300 capitalize">{anime.format}</span>
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-medium text-sm line-clamp-2 group-hover:text-indigo-400 transition-colors">
          {anime.title.romaji}
        </h3>
        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
          {anime.averageScore && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {anime.averageScore}
            </span>
          )}
          {anime.episodes && <span>{anime.episodes} eps</span>}
        </div>
      </div>
    </Card>
  );
}

function formatAiredDate(startDate?: { year?: number; month?: number; day?: number }, endDate?: { year?: number; month?: number; day?: number }) {
  const start = startDate?.year ? startDate.year + '-' + String(startDate.month || 1).padStart(2, '0') + '-' + String(startDate.day || 1).padStart(2, '0') : 'Unknown';
  const end = endDate?.year ? endDate.year + '-' + String(endDate.month || 1).padStart(2, '0') + '-' + String(endDate.day || 1).padStart(2, '0') : 'Present';
  return start + ' to ' + end;
}
