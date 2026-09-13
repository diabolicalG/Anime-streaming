import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

export function useHls(videoElement: HTMLVideoElement | null, src: string | null) {
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (!videoElement || !src || !Hls.isSupported()) return;

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    hlsRef.current = hls;

    hls.loadSource(src);
    hls.attachMedia(videoElement);

    return () => {
      hls.destroy();
      hlsRef.current = null;
    };
  }, [videoElement, src]);

  return hlsRef.current;
}
