import { beforeEach, describe, expect, it } from 'vitest';
import { usePlayerStore } from './usePlayerStore';

describe('usePlayerStore Phase 4 playback state', () => {
  beforeEach(() => usePlayerStore.getState().reset());

  it('resets playback state and selects the default subtitle with a source', () => {
    usePlayerStore.getState().setSources([{
      url: '/api/stream?src=one',
      quality: '1080p',
      isM3U8: true,
      subtitles: [{ url: '/sub.vtt', lang: 'en', label: 'English', default: true }],
    }]);

    const state = usePlayerStore.getState();
    expect(state.currentSource?.quality).toBe('1080p');
    expect(state.currentSubtitle?.lang).toBe('en');
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
  });

  it('stores session-only subtitle preferences and audio selection', () => {
    usePlayerStore.getState().setSubtitleOffset(1.5);
    usePlayerStore.getState().setSubtitleStyle('high-contrast');
    usePlayerStore.getState().setAudioTrack(2);
    usePlayerStore.getState().setResumePosition(120);

    const state = usePlayerStore.getState();
    expect(state.subtitleOffset).toBe(1.5);
    expect(state.subtitleStyle).toBe('high-contrast');
    expect(state.audioTrack).toBe(2);
    expect(state.resumePosition).toBe(120);
  });
});
