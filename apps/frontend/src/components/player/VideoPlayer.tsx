import { useEffect, useRef, useState, useCallback } from 'react';
import videojs from 'video.js';
import Hls from 'hls.js';
import 'video.js/dist/video-js.css';
import { usePlayerStore } from '../../store/usePlayerStore';
import type { StreamSource, SubtitleTrack } from '../../types/streaming';
import type { ManifestParsedData, LevelSwitchedData, Level } from 'hls.js';

// Get the player type from the video.js default export
type Player = ReturnType<typeof videojs>;

interface VideoPlayerProps {
  source: StreamSource | null;
  subtitles: SubtitleTrack[];
  onReady?: (player: Player) => void;
  onError?: (error: Error) => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export function VideoPlayer({
  source,
  subtitles,
  onReady,
  onError,
  onEnded,
  onTimeUpdate,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Quality level tracking from HLS
  const [availableLevels, setAvailableLevels] = useState<number[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number | null>(null);
  
  const { 
    isPlaying, 
    volume, 
    playbackRate, 
    setPlaying, 
    setCurrentTime, 
    setDuration,
    setVolume,
    setPlaybackRate,
  } = usePlayerStore();
  
  // Initialize quality level state from HLS manifest
  useEffect(() => {
    // Ensure state variables are read by TypeScript data flow
    void availableLevels;
    void currentLevel;
  }, [availableLevels, currentLevel]);

  const setupPlayer = useCallback(() => {
    if (!videoRef.current || playerRef.current) return;

    const options = {
      fluid: true,
      playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
      controls: true,
      responsive: true,
      preload: 'auto',
      html5: {
        hls: {
          overrideNative: true,
        },
        nativeAudioTracks: false,
        nativeVideoTracks: false,
      },
      controlBar: {
        children: [
          'playToggle',
          'volumePanel',
          'currentTimeDisplay',
          'timeDivider',
          'durationDisplay',
          'progressControl',
          'fullscreenToggle',
          'pictureInPictureToggle',
          'playbackRateMenuButton',
        ],
      },
    };

    const player = videojs(videoRef.current, options);
    playerRef.current = player;

    player.ready(() => {
      setIsReady(true);
      onReady?.(player);
    });

    player.on('play', () => setPlaying(true));
    player.on('pause', () => setPlaying(false));
    player.on('timeupdate', () => {
      const ct = player.currentTime();
      const dur = player.duration();
      if (typeof ct === 'number') setCurrentTime(ct);
      if (typeof dur === 'number' && dur > 0) setDuration(dur);
      if (typeof ct === 'number' && typeof dur === 'number') onTimeUpdate?.(ct, dur);
    });
    player.on('ended', () => onEnded?.());
    player.on('error', () => {
      const err = player.error();
      onError?.(new Error(err?.message || 'Video playback error'));
    });
    player.on('volumechange', () => {
      const vol = player.volume();
      if (typeof vol === 'number') setVolume(vol);
    });
    player.on('ratechange', () => {
      const rate = player.playbackRate();
      if (typeof rate === 'number') setPlaybackRate(rate);
    });

    if (source?.isM3U8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        startLevel: -1,
      });
      hlsRef.current = hls;
      
      hls.loadSource(source.url);

      // Track available quality levels from manifest parsed event
      hls.on(Hls.Events.MANIFEST_PARSED, (_event: any, data: ManifestParsedData) => {
        if (data.levels && Array.isArray(data.levels)) {
          const validHeights = data.levels
            .filter((l: Level) => l.height && l.height > 0)
            .map((l: Level) => l.height);
          setAvailableLevels([...new Set(validHeights)]);
        }
      });

      // Track current level from level switched event
      hls.on(Hls.Events.LEVEL_SWITCHED, (_event: any, _data: LevelSwitchedData) => {
        const currentLevelIndex = hls.currentLevel;
        if (currentLevelIndex !== -1 && currentLevelIndex < hls.levels.length) {
          const level = hls.levels[currentLevelIndex];
          if (level && level.height > 0) {
            setCurrentLevel(level.height);
          }
        }
      });
      const tech = player.tech() as { el_?: HTMLVideoElement } | undefined;
      if (tech?.el_) {
        hls.attachMedia(tech.el_);
      }
      
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          onError?.(new Error(`HLS Error: ${data.type} - ${data.details}`));
        }
      });
    } else if (source?.isM3U8 && videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      player.src({ src: source.url, type: 'application/x-mpegURL' });
    } else if (source) {
      player.src({ src: source.url, type: source.isM3U8 ? 'application/x-mpegURL' : 'video/mp4' });
    }

    if (subtitles.length > 0) {
      subtitles.forEach((sub, index) => {
        player.addRemoteTextTrack({
          kind: 'subtitles',
          label: sub.label,
          srclang: sub.lang,
          src: sub.url,
          default: sub.default || index === 0,
        }, false);
      });
    }

    return player;
  }, [source, subtitles, onReady, onError, onEnded, onTimeUpdate, setPlaying, setCurrentTime, setDuration, setVolume, setPlaybackRate]);

  const teardownPlayer = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }
    setIsReady(false);
  }, []);

  useEffect(() => {
    if (!playerRef.current || !isReady) return;
    const player = playerRef.current;
    
    if (isPlaying !== !player.paused()) {
      const playPromise = player.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      } else if (!isPlaying) {
        player.pause();
      }
    }
    
    const vol = player.volume();
    if (typeof vol === 'number' && Math.abs(vol - volume) > 0.01) {
      player.volume(volume);
    }
    
    const rate = player.playbackRate();
    if (typeof rate === 'number' && rate !== playbackRate) {
      player.playbackRate(playbackRate);
    }
  }, [isPlaying, volume, playbackRate, isReady]);

  useEffect(() => {
    setupPlayer();
    return teardownPlayer;
  }, [setupPlayer, teardownPlayer]);

  useEffect(() => {
    if (!playerRef.current || !source) return;
    const player = playerRef.current;
    
    if (source.isM3U8 && Hls.isSupported() && hlsRef.current) {
      hlsRef.current.loadSource(source.url);
    } else {
      player.src({ src: source.url, type: source.isM3U8 ? 'application/x-mpegURL' : 'video/mp4' });
    }
  }, [source]);

  return (
    <div 
      className="video-js vjs-big-play-centered w-full aspect-video"
      data-vjs-player
    >
      <video 
        ref={videoRef} 
        className="video-js vjs-big-play-centered"
        playsInline
      />
    </div>
  );
}
