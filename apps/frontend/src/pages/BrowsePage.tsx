import { useState, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { anilistApi } from '../services/anilist';
import { useNavigate } from 'react-router-dom';
import type { AniListMedia, MediaStatus, MediaFormat } from '../types/anilist';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports',
  'Supernatural', 'Thriller', 'Mecha', 'Music', 'Ecchi', 'Harem',
  'Isekai', 'Psychological', 'Historical', 'Military', 'Police',
  'School', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Kids'
];

const STATUS_OPTIONS: MediaStatus[] = ['FINISHED', 'RELEASING', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'];
const FORMAT_OPTIONS: MediaFormat[] = ['TV', 'TV_SHORT', 'MOVIE', 'SPECIAL', 'OVA', 'ONA', 'MUSIC', 'MANGA', 'NOVEL', 'ONE_SHOT'];

function BrowsePage() {
  const navigate = useNavigate();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const [filters, setFilters] = useState({
    genre: '',
    status: '',
    format: '',
    season: '',
    year: '',
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['anime', 'browse', 'infinite', filters],
    queryFn: async ({ pageParam = 1 }) => {
      const result = await anilistApi.browse({
        genre: filters.genre || undefined,
        status: filters.status || undefined,
        format: filters.format || undefined,
        season: filters.season || undefined,
        seasonYear: filters.year ? parseInt(filters.year) : undefined,
        page: pageParam,
        perPage: 20,
      });
      return {
        media: result.Page.media,
        pageInfo: result.Page.pageInfo,
      };
    },
    getNextPageParam: (lastPage: { media: AniListMedia[]; pageInfo: { hasNextPage: boolean; currentPage: number } }) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
    staleTime: 60 * 60 * 1000,
  });

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return;
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );
    
    observerRef.current.observe(loadMoreRef.current);
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleResultClick = (anime: AniListMedia) => {
    navigate(`/anime/${anime.id}`);
  };

  const clearFilters = () => {
    setFilters({
      genre: '',
      status: '',
      format: '',
      season: '',
      year: '',
    });
  };

  const allMedia = data?.pages.flatMap(page => page.media) || [];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Filters Sidebar */}
          <aside className="w-full md:w-64 flex-shrink-0">
            <Card className="p-4 sticky top-24 h-fit">
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-lg font-semibold mb-4">Filters</h2>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Genre</label>
                  <select
                    value={filters.genre}
                    onChange={(e) => handleFilterChange('genre', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline:none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Genres</option>
                    {GENRES.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline:none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Statuses</option>
                    {STATUS_OPTIONS.map(status => (
                      <option key={status} value={status}>{status.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Format</label>
                  <select
                    value={filters.format}
                    onChange={(e) => handleFilterChange('format', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline:none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Formats</option>
                    {FORMAT_OPTIONS.map(format => (
                      <option key={format} value={format}>{format}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Season</label>
                  <select
                    value={filters.season}
                    onChange={(e) => handleFilterChange('season', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline:none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Seasons</option>
                    <option value="WINTER">Winter</option>
                    <option value="SPRING">Spring</option>
                    <option value="SUMMER">Summer</option>
                    <option value="FALL">Fall</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Year</label>
                  <Input
                    type="number"
                    value={filters.year}
                    onChange={(e) => handleFilterChange('year', e.target.value)}
                    placeholder="e.g. 2024"
                    min={1970}
                    max={2030}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1">
                    Apply Filters
                  </Button>
                  <Button type="button" variant="ghost" onClick={clearFilters} className="flex-1">
                    Clear
                  </Button>
                </div>
              </form>
            </Card>
          </aside>

          {/* Results Grid */}
          <main className="flex-1 min-w-0">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-3xl font-bold">Browse Anime</h1>
              <span className="text-gray-400">
                {data ? data.pages.reduce((acc, page) => acc + page.media.length, 0) : 0} results
              </span>
            </div>

            {isLoading && !data && (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
              </div>
            )}

            {error && (
              <div className="card p-8 text-center">
                <h2 className="text-xl font-semibold mb-2">Failed to Load</h2>
                <p className="text-gray-400 mb-6">Unable to fetch results. Please try again.</p>
              </div>
            )}

            {allMedia.length === 0 && !isLoading && !error && (
              <div className="card p-8 text-center">
                <p className="text-gray-400">No anime found with these filters</p>
              </div>
            )}

            {allMedia.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {allMedia.map((anime) => (
                  <AnimeCard key={anime.id} anime={anime} onClick={handleResultClick} />
                ))}
              </div>
            )}

            <div ref={loadMoreRef} className="h-10">
              {isFetchingNextPage && (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-500 border-t-transparent"></div>
                </div>
              )}
              {!hasNextPage && allMedia.length > 0 && (
                <p className="text-center text-gray-500 py-4">End of results</p>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function AnimeCard({ anime, onClick }: { anime: AniListMedia; onClick: (anime: AniListMedia) => void }) {
  return (
    <Card 
      className="cursor-pointer hover:scale-105 transition-transform duration-200 group"
      onClick={() => onClick(anime)}
    >
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
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-1.175 0l-2.8 2.034a1 1 0 00-.364 1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
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

export default BrowsePage;
