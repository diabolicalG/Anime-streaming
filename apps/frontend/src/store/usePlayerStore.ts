import { create } from 'zustand';
import type { StreamSource, SubtitleTrack } from '../types/streaming';

interface PlayerState {
  sources: StreamSource[];
  currentSource: StreamSource | null;
  subtitles: SubtitleTrack[];
  currentSubtitle: SubtitleTrack | null;
  quality: string;
  isPlaying: boolean;
  volume: number;
  playbackRate: number;
  currentTime: number;
  duration: number;
  fullscreen: boolean;
  pip: boolean;
  
  setSources: (sources: StreamSource[]) => void;
  selectSource: (source: StreamSource) => void;
  selectSubtitle: (subtitle: SubtitleTrack | null) => void;
  setQuality: (quality: string) => void;
  setPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  toggleFullscreen: () => void;
  togglePip: () => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  sources: [],
  currentSource: null,
  subtitles: [],
  currentSubtitle: null,
  quality: 'auto',
  isPlaying: false,
  volume: 1,
  playbackRate: 1,
  currentTime: 0,
  duration: 0,
  fullscreen: false,
  pip: false,

  setSources: (sources) => set({ sources, currentSource: sources[0] || null }),
  selectSource: (source) => set({ currentSource: source, quality: source.quality }),
  selectSubtitle: (subtitle) => set({ currentSubtitle: subtitle }),
  setQuality: (quality) => set({ quality }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen })),
  togglePip: () => set((state) => ({ pip: !state.pip })),
  reset: () => set({
    sources: [], currentSource: null, subtitles: [], currentSubtitle: null,
    quality: 'auto', isPlaying: false, volume: 1, playbackRate: 1,
    currentTime: 0, duration: 0, fullscreen: false, pip: false,
  }),
}));
