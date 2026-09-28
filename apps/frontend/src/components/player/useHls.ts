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
}

export function useHls(
  videoElement: HTMLVideoElement | null,
  src: string | null,
): UseHlsResult {
  const hlsRef = useRef<Hls | null>(null)
  const [levels, setLevels] = useState<Level[]>([])
  const [currentLevel, setCurrentLevel] = useState<number>(-1)
  const [error, setError] = useState<Error | null>(null)
  const recoveryAttempted = useRef(false)

  useEffect(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (!videoElement || !src || !isSupported) {
      setLevels([])
      setCurrentLevel(-1)
      setError(null)
      recoveryAttempted.current = false
      return
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    })
    hlsRef.current = hls

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      setLevels(hls.levels || [])
      setCurrentLevel(-1)
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
  }, [videoElement, src])

  const setLevel = (level: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level
      setCurrentLevel(level)
    }
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
    }),
    [levels, currentLevel, error],
  )
}