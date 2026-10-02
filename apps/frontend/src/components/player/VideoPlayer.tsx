import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../../store/usePlayerStore'
import type { StreamSource, SubtitleTrack } from '../../types/streaming'
import { useHls } from './useHls'

interface VideoPlayerProps {
  source: StreamSource | null
  subtitles: SubtitleTrack[]
  onReady?: (player: unknown) => void
  onError?: (error: Error) => void
  onEnded?: () => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onLevelsChange?: (levels: { height: number; bitrate: number }[]) => void
}

const QUALITY_HEIGHTS: Record<string, number> = {
  '2160p': 2160,
  '1440p': 1440,
  '1080p': 1080,
  '720p': 720,
  '480p': 480,
  '360p': 360,
  '240p': 240,
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
  } = useHls(videoElement, source?.url ?? null, {
    referrer: source?.referrer,
    headers: source?.headers,
  })

  const callbacksRef = useRef({ onReady, onError, onEnded, onTimeUpdate })
  callbacksRef.current = { onReady, onError, onEnded, onTimeUpdate }

  const readyFiredRef = useRef(false)
  const levelsKey = levels.map((l) => `${l.height}-${l.bitrate}`).join(',')

  useEffect(() => {
    if (hlsError) {
      callbacksRef.current.onError?.(hlsError)
    }
  }, [hlsError])

  useEffect(() => {
    if (!onLevelsChange) return
    onLevelsChange(levels.map((l) => ({ height: l.height, bitrate: l.bitrate })))
  }, [levelsKey, onLevelsChange])

  useEffect(() => {
    if (levels.length === 0) return

    if (quality === 'auto') {
      if (currentLevel !== -1) setLevel(-1)
      return
    }

    const target = QUALITY_HEIGHTS[quality]
    if (target === undefined) return

    const index = levels.findIndex((l) => l.height === target)
    if (index !== -1 && index !== currentLevel) {
      setLevel(index)
    }
  }, [quality, levelsKey, currentLevel, setLevel])

  useEffect(() => {
    const video = videoElement
    if (!video) return

    const handleTimeUpdate = () => {
      const ct = video.currentTime
      const dur = video.duration
      if (typeof ct === 'number') setCurrentTime(ct)
      if (typeof ct === 'number' && typeof dur === 'number') {
        callbacksRef.current.onTimeUpdate?.(ct, dur)
      }
    }

    const handleLoadedMetadata = () => {
      const dur = video.duration
      if (typeof dur === 'number' && dur > 0) setDuration(dur)
    }

    const handlePlay = () => {
      setPlaying(true)
      if (!readyFiredRef.current) {
        readyFiredRef.current = true
        callbacksRef.current.onReady?.(video)
      }
    }

    const handlePause = () => {
      setPlaying(false)
    }

    const handleEnded = () => {
      setPlaying(false)
      callbacksRef.current.onEnded?.()
    }

    const handleError = () => {
      const err = video.error
      callbacksRef.current.onError?.(
        new Error(err?.message || `MediaError code ${err?.code ?? 'unknown'}`),
      )
    }

    const handleVolumeChange = () => {
      const vol = video.volume
      if (typeof vol === 'number' && Math.abs(vol - volume) > 0.01) {
        setVolume(vol)
      }
    }

    const handleRateChange = () => {
      const rate = video.playbackRate
      if (typeof rate === 'number' && rate !== playbackRate) {
        setPlaybackRate(rate)
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleError)
    video.addEventListener('volumechange', handleVolumeChange)
    video.addEventListener('ratechange', handleRateChange)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.removeEventListener('volumechange', handleVolumeChange)
      video.removeEventListener('ratechange', handleRateChange)
    }
  }, [videoElement])

  useEffect(() => {
    const video = videoElement
    if (!video) return

    if (isPlaying) {
      if (video.paused) {
        const promise = video.play()
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {})
        }
      }
    } else if (!video.paused) {
      video.pause()
    }
  }, [isPlaying, videoElement])

  useEffect(() => {
    const video = videoElement
    if (!video) return
    if (Math.abs(video.volume - volume) > 0.01) {
      video.volume = volume
    }
  }, [volume, videoElement])

  useEffect(() => {
    const video = videoElement
    if (!video) return
    if (video.playbackRate !== playbackRate) {
      video.playbackRate = playbackRate
    }
  }, [playbackRate, videoElement])

  useEffect(() => {
    readyFiredRef.current = false
  }, [source])

  return (
    <div className="w-full aspect-video bg-black">
      <video
        ref={setVideoElement}
        className="w-full h-full"
        playsInline
        controls
        crossOrigin="anonymous"
      >
        {subtitles.map((track) => (
          <track
            key={track.url}
            kind="subtitles"
            src={track.url}
            srcLang={track.lang}
            label={track.label}
            default={track.default}
          />
        ))}
      </video>
    </div>
  )
}