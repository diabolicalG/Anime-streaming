import { useEffect, useRef, useState } from 'react'
import { usePlayerStore } from '../../store/usePlayerStore'
import type { StreamSource, SubtitleTrack } from '../../types/streaming'
import { useHls } from './useHls'
import { useMobilePlayer } from '../../hooks/useMobilePlayer'

interface VideoPlayerProps {
  source: StreamSource | null
  subtitles: SubtitleTrack[]
  onReady?: (player: unknown) => void
  onError?: (error: Error) => void
  onEnded?: () => void
  onPause?: () => void
  onTimeUpdate?: (currentTime: number, duration: number) => void
  initialTime?: number
  preferredSubtitleLang?: string
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
  onPause,
  onTimeUpdate,
  onLevelsChange,
  initialTime = 0,
  preferredSubtitleLang,
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
    currentSubtitle,
    subtitleOffset,
    subtitleStyle,
    setManifestSubtitles,
    setAudioTracks,
    setAudioTrack,
    audioTrack,
    selectSubtitle,
  } = usePlayerStore()

  const {
    levels,
    currentLevel,
    setLevel,
    error: hlsError,
    subtitleTracks: manifestSubtitleTracks,
    audioTracks: manifestAudioTracks,
    setSubtitleTrack,
    setAudioTrack: setHlsAudioTrack,
  } = useHls(videoElement, source?.url ?? null, {
    referrer: source?.referrer,
    headers: source?.headers,
  })

  const callbacksRef = useRef({ onReady, onError, onEnded, onPause, onTimeUpdate })

  const seekBy = (delta: number) => {
    if (!videoElement) return
    videoElement.currentTime = Math.max(0, Math.min(videoElement.duration || Infinity, videoElement.currentTime + delta))
  }

  const mobile = useMobilePlayer({ videoElement, onSeek: seekBy })
  callbacksRef.current = { onReady, onError, onEnded, onPause, onTimeUpdate }

  const readyFiredRef = useRef(false)
  const cueBaseTimesRef = useRef(new WeakMap<TextTrackCue, { start: number; end: number }>())
  const levelsKey = levels.map((l) => `${l.height}-${l.bitrate}`).join(',')
  const subtitleKey = manifestSubtitleTracks.map((t, i) => `${i}-${t.lang ?? ''}-${t.name ?? ''}`).join(',')
  const audioKey = manifestAudioTracks.map((t, i) => `${i}-${t.lang ?? ''}-${t.name ?? ''}`).join(',')

  useEffect(() => {
    if (!preferredSubtitleLang || subtitles.length === 0) return
    const match = subtitles.find((track) => track.lang.toLowerCase() === preferredSubtitleLang.toLowerCase())
    if (match) selectSubtitle(match)
  }, [preferredSubtitleLang, subtitles, selectSubtitle])

  useEffect(() => {
    if (manifestSubtitleTracks.length > 0) {
      setManifestSubtitles(manifestSubtitleTracks.map((track, index) => ({
        url: `hls:${index}`,
        lang: track.lang ?? '',
        label: track.label ?? track.name ?? track.lang ?? `Subtitle ${index + 1}`,
        default: Boolean(track.default),
      })))
    }
    setAudioTracks(manifestAudioTracks)
  }, [subtitleKey, audioKey])

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
    if (!video || !currentSubtitle || currentSubtitle.url.startsWith('hls:')) return
    const applyOffset = () => {
      for (let i = 0; i < video.textTracks.length; i += 1) {
        const track = video.textTracks[i]
        if (track.label !== currentSubtitle.label && track.language !== currentSubtitle.lang) continue
        const cues = track.cues
        if (!cues) continue
        for (let j = 0; j < cues.length; j += 1) {
          const cue = cues[j]
          const existing = cueBaseTimesRef.current.get(cue)
          if (!existing) {
            cueBaseTimesRef.current.set(cue, { start: cue.startTime, end: cue.endTime })
          }
          const base = cueBaseTimesRef.current.get(cue)!
          cue.startTime = Math.max(0, base.start + subtitleOffset)
          cue.endTime = Math.max(cue.startTime, base.end + subtitleOffset)
        }
      }
    }
    applyOffset()
    const timer = window.setInterval(applyOffset, 500)
    return () => window.clearInterval(timer)
  }, [videoElement, currentSubtitle, subtitleOffset])

  useEffect(() => {
    if (!currentSubtitle) {
      setSubtitleTrack(-1)
      return
    }
    if (currentSubtitle.url.startsWith('hls:')) {
      setSubtitleTrack(Number(currentSubtitle.url.slice(4)))
    }
  }, [currentSubtitle, setSubtitleTrack])

  useEffect(() => {
    if (audioTrack >= 0) setHlsAudioTrack(audioTrack)
  }, [audioTrack, setHlsAudioTrack])

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
      if (initialTime > 0 && Number.isFinite(initialTime)) {
        const target = Math.min(initialTime, Math.max(0, dur || initialTime))
        try { video.currentTime = target } catch {}
      }
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
      callbacksRef.current.onPause?.()
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
  }, [videoElement, initialTime, onPause])

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
    if (!video || !source) return

    const startIfPlaying = () => {
      if (usePlayerStore.getState().isPlaying && video.paused) {
        const promise = video.play()
        if (promise && typeof promise.catch === 'function') {
          promise.catch(() => {})
        }
      }
    }

    video.addEventListener('loadedmetadata', startIfPlaying)
    return () => video.removeEventListener('loadedmetadata', startIfPlaying)
  }, [videoElement, source])

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
        className={`w-full h-full subtitle-style-${subtitleStyle}`}
        onTouchStart={mobile.onTouchStart}
        onTouchEnd={mobile.onTouchEnd}
        playsInline
        controls
        crossOrigin="anonymous"
      >
        {subtitles.filter((track) => !track.url.startsWith('hls:')).map((track) => (
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
      {mobile.isMobile && mobile.dataSaverRecommended && (
        <div className="mobile-data-saver" role="status">
          Data Saver is enabled; lower quality may reduce data usage.
        </div>
      )}
      {mobile.isMobile && mobile.pipSupported && (
        <button type="button" className="mobile-pip-button" onClick={() => void mobile.enterPip()} aria-label="Picture in Picture">
          PiP
        </button>
      )}
    </div>
  )
}