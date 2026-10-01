import { useEffect, useRef, useState, useCallback } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'
import { usePlayerStore } from '../../store/usePlayerStore'
import type { StreamSource, SubtitleTrack } from '../../types/streaming'
import { useHls } from './useHls'

type Player = ReturnType<typeof videojs>

interface VideoPlayerProps {
  source: StreamSource | null
  subtitles: SubtitleTrack[]
  onReady?: (player: Player) => void
  onError?: (error: Error) => void
  onEnded?: () => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onLevelsChange?: (levels: { height: number; bitrate: number }[]) => void
}

export function VideoPlayer({
  source,
  subtitles,
  onReady,
  onError,
  onEnded,
  onTimeUpdate,
  onLevelsChange,
}: VideoPlayerProps) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const playerRef = useRef<Player | null>(null)
  const [isReady, setIsReady] = useState(false)

  const {
    isPlaying,
    volume,
    playbackRate,
    quality,
    setPlaying,
    setCurrentTime,
    setDuration,
    setVolume,
    setPlaybackRate,
  } = usePlayerStore()

  const {
    levels,
    currentLevel,
    setLevel,
    error: hlsError,
    isSupported,
  } = useHls(videoElement, source?.url ?? null, {
    referrer: source?.referrer,
    headers: source?.headers,
  })

  const qualityToLevel = (q: string): number => {
    switch (q) {
      case '1080p':
        return levels.findIndex((l) => l.height === 1080)
      case '720p':
        return levels.findIndex((l) => l.height === 720)
      case '480p':
        return levels.findIndex((l) => l.height === 480)
      case '360p':
        return levels.findIndex((l) => l.height === 360)
      case 'auto':
      default:
        return -1
    }
  }

  useEffect(() => {
    if (hlsError) {
      onError?.(hlsError)
    }
  }, [hlsError, onError])

  // Stable key for levels: join heights and bitrates to avoid new-array-ref triggers
  const levelsKey = levels.map((l) => `${l.height}-${l.bitrate}`).join(',')

  useEffect(() => {
    if (!onLevelsChange) return
    onLevelsChange(levels.map((l) => ({ height: l.height, bitrate: l.bitrate })))
  }, [levelsKey, onLevelsChange, levels])

  useEffect(() => {
    if (quality !== 'auto' && levels.length > 0) {
      const targetLevel = qualityToLevel(quality)
      if (targetLevel !== -1 && targetLevel !== currentLevel) {
        setLevel(targetLevel)
      }
    }
  }, [quality, levels, currentLevel, setLevel])

  // Latest-callback refs: keep the player-lifecycle effect dependent only on
  // videoElement. Reading props/subtitles through refs means a new inline
  // arrow (e.g. onEnded={() => ...}) cannot re-trigger dispose/recreate.
  const callbacksRef = useRef({ onReady, onError, onEnded, onTimeUpdate })
  callbacksRef.current = { onReady, onError, onEnded, onTimeUpdate }

  const subtitlesRef = useRef(subtitles)
  subtitlesRef.current = subtitles

  const setupPlayer = useCallback(() => {
    if (!videoElement || playerRef.current) return

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
    }

    const player = videojs(videoElement, options)
    playerRef.current = player

    player.ready(() => {
      setIsReady(true)
      callbacksRef.current.onReady?.(player)
    })

    player.on('play', () => setPlaying(true))
    player.on('pause', () => setPlaying(false))
    player.on('timeupdate', () => {
      const ct = player.currentTime()
      const dur = player.duration()
      if (typeof ct === 'number') setCurrentTime(ct)
      if (typeof dur === 'number' && dur > 0) setDuration(dur)
      if (typeof ct === 'number' && typeof dur === 'number') callbacksRef.current.onTimeUpdate?.(ct, dur)
    })
    player.on('ended', () => callbacksRef.current.onEnded?.())
    player.on('error', () => {
      const err = player.error()
      callbacksRef.current.onError?.(new Error(err?.message || 'Video playback error'))
    })
    player.on('volumechange', () => {
      const vol = player.volume()
      if (typeof vol === 'number') setVolume(vol)
    })
    player.on('ratechange', () => {
      const rate = player.playbackRate()
      if (typeof rate === 'number') setPlaybackRate(rate)
    })

    const subs = subtitlesRef.current
    if (subs.length > 0) {
      subs.forEach((sub, index) => {
        player.addRemoteTextTrack({
          kind: 'subtitles',
          label: sub.label,
          srclang: sub.lang,
          src: sub.url,
          default: sub.default || index === 0,
        }, false)
      })
    }
  }, [videoElement, setPlaying, setCurrentTime, setDuration, setVolume, setPlaybackRate])

  const teardownPlayer = useCallback(() => {
    if (playerRef.current) {
      playerRef.current.dispose()
      playerRef.current = null
    }
    setIsReady(false)
  }, [])

  // Create the player once per <video> element. Because this effect depends
  // only on stable values, a source (or subtitle) change never disposes and
  // recreates the player — video.js dispose() removes DOM it injected around
  // the <video>, which React then fails to remove in commitDeletionEffectsOnFiber.
  useEffect(() => {
    setupPlayer()
    return teardownPlayer
  }, [setupPlayer, teardownPlayer])

  useEffect(() => {
    if (!playerRef.current || !isReady) return
    const player = playerRef.current

    if (isPlaying !== !player.paused()) {
      const playPromise = player.play()
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {})
      } else if (!isPlaying) {
        player.pause()
      }
    }

    const vol = player.volume()
    if (typeof vol === 'number' && Math.abs(vol - volume) > 0.01) {
      player.volume(volume)
    }

    const rate = player.playbackRate()
    if (typeof rate === 'number' && rate !== playbackRate) {
      player.playbackRate(playbackRate)
    }
  }, [isPlaying, volume, playbackRate, isReady])

  useEffect(() => {
    if (!playerRef.current || !source) return
    const player = playerRef.current

    if (source.isM3U8 && isSupported) {
      player.src({ src: source.url, type: 'application/x-mpegURL' })
    } else {
      player.src({ src: source.url, type: source.isM3U8 ? 'application/x-mpegURL' : 'video/mp4' })
    }
  }, [source, isSupported])

  return (
    <div
      className="video-js vjs-big-play-centered w-full aspect-video"
      data-vjs-player
    >
      <video
        ref={setVideoElement}
        className="video-js vjs-big-play-centered"
        playsInline
      />
    </div>
  )
}