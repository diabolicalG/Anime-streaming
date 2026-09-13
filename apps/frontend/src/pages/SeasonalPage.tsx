import { useState, useEffect, useCallback, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { anilistApi } from '../services/anilist';
import { useNavigate } from 'react-router-dom';
import type { AniListMedia, MediaSeason } from '../types/anilist';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

const SEASONS: MediaSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

function getCurrentSeasonAndYear(): { season: MediaSeason; year: number } {
  const now = new Date();
  const month = now.getMonth();
  let season: MediaSeason;
  if (month >= 0 && month <= 2) season = 'WINTER';
  else if (month >= 3 && month <= 5) season = 'SPRING';
  else if (month >= 6 && month <= 8) season = 'SUMMER';
  else season = 'FALL';
  return { season, year: now.getFullYear() };
}

function getSeasonOrder(season: MediaSeason): number {
  const order = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 };
  return order[season];
}

function getSeasonDisplayName(season: MediaSeason): string {
  const names = { WINTER: 'Winter', SPRING: 'Spring', SUMMER: 'Summer', FALL: 'Fall' };
  return names[season];
}

export default function SeasonalPage() {
  const navigate = useNavigate();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { season: currentSeason, year: currentYear } = getCurrentSeasonAndYear();
  const [activeTab, setActiveTab] = useState<'current' | 'upcoming' | 'past'>('current');
  const [selectedSeason, setSelectedSeason] = useState<MediaSeason>(currentSeason);
  const [selectedYear, setSelectedYear] = useState(currentYear);

  // Determine which seasons belong to each tab
  const currentSeasonOrder = getSeasonOrder(currentSeason);
  
  const getTabSeasons = useCallback(() => {
    const seasons: { season: MediaSeason; year: number }[] = [];
    
    if (activeTab === 'current') {
      // Current season only
      seasons.push({ season: currentSeason, year: currentYear });
    } else if (activeTab === 'upcoming') {
      // Next 3 seasons
      let order = getSeasonOrder(currentSeason) + 1;
      let year = currentYear;
      for (let i = 0; i < 3; i++) {
        if (order > 3) { order = 0; year++; }
        const season = SEASONS[order];
        seasons.push({ season, year });
      }
    } else if (activeTab === 'past') {
      // Previous 3 seasons
      let order = getSeasonOrder(currentSeason) - 1;
      let year = currentYear;
      for (let i = 0; i < 3; i++) {
        if (order < 0) { order = 3; year--; }
        const season = SEASONS[order];
        seasons.push({ season, year });
        order--;
      }
      seasons.reverse(); // Show oldest first
    }
    return seasons;
  }, [activeTab, currentSeason, currentYear]);

  const tabSeasons = getTabSeasons();
  const [firstTabSeason] = tabSeasons;
  const [selectedSeasonState, setSelectedSeasonState] = useState<MediaSeason>(firstTabSeason?.season || currentSeason);
  const [selectedYearState, setSelectedYearState] = useState(firstTabSeason?.year || currentYear);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useInfiniteQuery({
    queryKey: ['anime', 'seasonal', 'infinite', selectedSeasonState, selectedYearState],
    queryFn: async ({ pageParam = 1 }) => {
      const { data } = await anilistApi.seasonal(selectedSeasonState, selectedYearState, pageParam, 20);
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

  const allMedia = data?.pages.flatMap(page => page.media) || [];

  const handleResultClick = (anime: AniListMedia) => {
    navigate(`/anime/${anime.id}`);
  };

  // Update selected season/year when tab changes
  useEffect(() => {
    if (tabSeasons.length > 0) {
      setSelectedSeasonState(tabSeasons[0].season);
      setSelectedYearState(tabSeasons[0].year);
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Seasonal Anime</h1>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-gray-800">
          {[
            { id: 'current', label: 'Current' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'past', label: 'Past' },
          ].map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'ghost'}
              onClick={() => setActiveTab(tab.id as 'current' | 'upcoming' | 'past')}
              className="px-6 py-2"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Season Selector for Current/Upcoming/Past tabs */}
        {tabSeasons.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {tabSeasons.map(({ season, year }, index) => (
              <Button
                key={`${season}-${year}`}
                variant={selectedSeasonState === season && selectedYearState === year ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => {
                  setSelectedSeasonState(season);
                  setSelectedYearState(year);
                }}
                className="px-4 py-1.5"
              >
                {getSeasonDisplayName(season)} {year}
              </Button>
            ))}
          </div>
        )}

        {isLoading && !data && (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
          </div>
        )}

        {error && (
          <div className="card p-8 text-center max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-2">Failed to Load</h2>
            <p className="text-gray-400 mb-6">Unable to fetch seasonal anime.</p>
          </div>
        )}

        {allMedia.length === 0 && !isLoading && !error && (
          <div className="card p-8 text-center">
            <p className="text-gray-400">No anime found for {getSeasonDisplayName(selectedSeasonState)} {selectedYearState}</p>
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

export default SeasonalPage;
