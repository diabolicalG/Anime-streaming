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
  resumePosition: number;
  subtitleOffset: number;
  subtitleStyle: 'default' | 'large' | 'high-contrast';
  audioTrack: number;
  setManifestSubtitles: (tracks: SubtitleTrack[]) => void;
  setAudioTracks: (tracks: Array<{ lang?: string; name?: string; label?: string }>) => void;
  audioTracks: Array<{ lang?: string; name?: string; label?: string }>;
  setResumePosition: (position: number) => void;
  setSubtitleOffset: (offset: number) => void;
  setSubtitleStyle: (style: 'default' | 'large' | 'high-contrast') => void;
  setAudioTrack: (track: number) => void;
  
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
  resumePosition: 0,
  subtitleOffset: 0,
  subtitleStyle: 'default',
  audioTrack: -1,
  audioTracks: [],

  setSources: (sources) => set({ sources, currentSource: sources[0] || null, subtitles: sources[0]?.subtitles ?? [], currentSubtitle: sources[0]?.subtitles?.find((track) => track.default) ?? null, currentTime: 0, duration: 0 }),
  selectSource: (source) => set({ currentSource: source, quality: source.quality, subtitles: source.subtitles ?? [], currentSubtitle: source.subtitles?.find((track) => track.default) ?? null }),
  selectSubtitle: (subtitle) => set({ currentSubtitle: subtitle }),
  setQuality: (quality) => set({ quality }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  setVolume: (volume) => set({ volume }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  toggleFullscreen: () => set((state) => ({ fullscreen: !state.fullscreen })),
  togglePip: () => set((state) => ({ pip: !state.pip })),
  setResumePosition: (resumePosition) => set({ resumePosition }),
  setSubtitleOffset: (subtitleOffset) => set({ subtitleOffset }),
  setSubtitleStyle: (subtitleStyle) => set({ subtitleStyle }),
  setAudioTrack: (audioTrack) => set({ audioTrack }),
  setManifestSubtitles: (tracks) => set({ subtitles: tracks, currentSubtitle: tracks.find((track) => track.default) ?? null }),
  setAudioTracks: (audioTracks) => set({ audioTracks }),
  reset: () => set({
    sources: [], currentSource: null, subtitles: [], currentSubtitle: null,
    quality: 'auto', isPlaying: false, volume: 1, playbackRate: 1,
    currentTime: 0, duration: 0, fullscreen: false, pip: false,
    resumePosition: 0, subtitleOffset: 0, subtitleStyle: 'default', audioTrack: -1, audioTracks: [],
  }),
}));
