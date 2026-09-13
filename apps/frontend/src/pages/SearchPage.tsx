import { useState, useCallback, useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { anilistApi } from '../services/anilist';
import { useNavigate } from 'react-router-dom';
import type { AniListMedia } from '../types/anilist';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card } from '../components/ui/Card';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const navigate = useNavigate();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Debounce search query (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['anime', 'search', 'infinite', debouncedQuery],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await anilistApi.search({ search: debouncedQuery, page: pageParam, perPage: 20 });
      return {
        media: data.Page.media,
        pageInfo: data.Page.pageInfo,
      };
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.pageInfo.hasNextPage) {
        return lastPage.pageInfo.currentPage + 1;
      }
      return undefined;
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 5 * 60 * 1000,
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setDebouncedQuery(query.trim());
    }
  };

  const handleResultClick = (anime: AniListMedia) => {
    navigate(`/anime/${anime.id}`);
  };

  if (isLoading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Search Failed</h2>
          <p className="text-gray-400 mb-6">Unable to search. Please try again.</p>
        </div>
      </div>
    );
  }

  const allMedia = data?.pages.flatMap(page => page.media) || [];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex gap-4 max-w-2xl mx-auto">
            <Input
              id="search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search anime..."
              autoFocus
              className="flex-1"
            />
            <Button type="submit" disabled={query.trim().length < 2}>
              Search
            </Button>
          </div>
        </form>

        {debouncedQuery.length < 2 && query.length > 0 && (
          <p className="text-center text-gray-500 mb-8">
            Type at least 2 characters to search
          </p>
        )}

        {debouncedQuery.length >= 2 && allMedia.length === 0 && !isLoading && (
          <div className="card p-8 text-center">
            <p className="text-gray-400">No results found for "{debouncedQuery}"</p>
          </div>
        )}

        {allMedia.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
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

export default SearchPage;
