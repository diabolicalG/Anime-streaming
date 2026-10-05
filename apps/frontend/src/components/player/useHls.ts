import { useEffect, useRef, useState, useMemo } from 'react'
import Hls from 'hls.js'
import type { Level } from 'hls.js'

const isSupported = Hls.isSupported()

interface UseHlsResult {
  levels: Level[]
  currentLevel: number
  setLevel: (level: number) => void
  isSupported: boolean
  error: Error | null
  recover: () => void
  subtitleTracks: Array<{ lang?: string; name?: string; label?: string; default?: boolean }>
  audioTracks: Array<{ lang?: string; name?: string; label?: string }>
  setSubtitleTrack: (index: number) => void
  setAudioTrack: (index: number) => void
}

export function useHls(
  videoElement: HTMLVideoElement | null,
  src: string | null,
  config?: { referrer?: string; headers?: Record<string, string> },
): UseHlsResult {
  const hlsRef = useRef<Hls | null>(null)
  const [levels, setLevels] = useState<Level[]>([])
  const [currentLevel, setCurrentLevel] = useState<number>(-1)
  const [error, setError] = useState<Error | null>(null)
  const recoveryAttempted = useRef(false)
  const [subtitleTracks, setSubtitleTracks] = useState<Array<{ lang?: string; name?: string; label?: string; default?: boolean }>>([])
  const [audioTracks, setAudioTracks] = useState<Array<{ lang?: string; name?: string; label?: string }>>([])

  // Stable key for config so the effect does not re-run on new object identity
  const configKey = config
    ? JSON.stringify([config.referrer ?? '', config.headers ?? null])
    : ''

  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!videoElement || !src || !isSupported) {
      setLevels([])
      setCurrentLevel(-1)
      setError(null)
      setSubtitleTracks([])
      setAudioTracks([])
      setSubtitleTracks([])
      setAudioTracks([])
      recoveryAttempted.current = false
      return
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    })
    hlsRef.current = hls

    if (config?.headers || config?.referrer) {
      hls.config.xhrSetup = (xhr: XMLHttpRequest) => {
        if (config.headers) {
          for (const [k, v] of Object.entries(config.headers)) {
            try { xhr.setRequestHeader(k, v) } catch {}
          }
        }
        if (config.referrer) {
          try { xhr.setRequestHeader('Referer', config.referrer) } catch {}
        }
      }
    }

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setLevels(hls.levels || [])
      setCurrentLevel(-1)
      setSubtitleTracks((hls.subtitleTracks || []).map((track: any) => ({
        lang: track.lang,
        name: track.name,
        label: track.name,
        default: track.default,
      })))
      setAudioTracks((hls.audioTracks || []).map((track: any) => ({
        lang: track.lang,
        name: track.name,
        label: track.name,
      })))
    })

    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
      setSubtitleTracks((hls.subtitleTracks || []).map((track: any) => ({
        lang: track.lang,
        name: track.name,
        label: track.name,
        default: track.default,
      })))
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      setAudioTracks((hls.audioTracks || []).map((track: any) => ({
        lang: track.lang,
        name: track.name,
        label: track.name,
      })))
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, () => {
      if (hls.currentLevel !== -1 && hls.currentLevel < hls.levels.length) {
        setCurrentLevel(hls.currentLevel)
      }
    })

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        if (!recoveryAttempted.current) {
          recoveryAttempted.current = true
          hls.recoverMediaError()
        } else {
          setError(new Error(`HLS Error: ${data.type} - ${data.details}`))
        }
      }
    })

    hls.loadSource(src)
    hls.attachMedia(videoElement)

    return () => {
      hls.destroy()
      hlsRef.current = null
      setLevels([])
      setCurrentLevel(-1)
      setError(null)
      recoveryAttempted.current = false
    }
  }, [videoElement, src, configKey])

  const setLevel = (level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level
      setCurrentLevel(level)
    }
  }

  const setSubtitleTrack = (index: number) => {
    if (hlsRef.current) hlsRef.current.subtitleTrack = index
  }

  const setAudioTrack = (index: number) => {
    if (hlsRef.current) hlsRef.current.audioTrack = index
  }

  const recover = () => {
    if (hlsRef.current) {
      hlsRef.current.recoverMediaError()
      setError(null)
      recoveryAttempted.current = false
    }
  }

  return useMemo(
    () => ({
      levels,
      currentLevel,
      setLevel,
      isSupported,
      error,
      recover,
      subtitleTracks,
      audioTracks,
      setSubtitleTrack,
      setAudioTrack,
    }),
    [levels, currentLevel, error, subtitleTracks, audioTracks],
  )
}