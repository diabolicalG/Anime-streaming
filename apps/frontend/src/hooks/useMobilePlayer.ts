import { useCallback, useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';

interface MobilePlayerOptions {
  enabled?: boolean;
  seekSeconds?: number;
  onSeek?: (delta: number) => void;
  videoElement: HTMLVideoElement | null;
}

export function useMobilePlayer({
  enabled = true,
  seekSeconds = 10,
  onSeek,
  videoElement,
}: MobilePlayerOptions) {
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [dataSaverRecommended, setDataSaverRecommended] = useState(false);

  useEffect(() => {
    const update = () => setIsMobile(window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    setPipSupported(Boolean(document.pictureInPictureEnabled && videoElement && 'requestPictureInPicture' in videoElement));
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setDataSaverRecommended(Boolean(connection?.saveData));
  }, [videoElement]);

  const onTouchStart = useCallback((event: TouchEvent<HTMLVideoElement>) => {
    if (!enabled || !isMobile) return;
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, [enabled, isMobile]);

  const onTouchEnd = useCallback((event: React.TouchEvent<HTMLVideoElement>) => {
    if (!enabled || !isMobile || !touchStart.current || !onSeek) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    onSeek(dx > 0 ? -seekSeconds : seekSeconds);
  }, [enabled, isMobile, onSeek, seekSeconds]);

  const enterPip = useCallback(async () => {
    if (!videoElement || !pipSupported) return false;
    try {
      if (document.pictureInPictureElement === videoElement) return true;
      await videoElement.requestPictureInPicture();
      return true;
    } catch {
      return false;
    }
  }, [videoElement, pipSupported]);

  const exitPip = useCallback(async () => {
    if (document.pictureInPictureElement !== videoElement) return;
    try { await document.exitPictureInPicture(); } catch {}
  }, [videoElement]);

  const toggleFullscreen = useCallback(async () => {
    if (!videoElement) return;
    const container = videoElement.parentElement;
    try {
      if (!document.fullscreenElement && container) {
        await container.requestFullscreen();
        await screen.orientation?.lock?.('landscape').catch(() => {});
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
        screen.orientation?.unlock?.();
      }
    } catch {}
  }, [videoElement]);

  return {
    isMobile,
    pipSupported,
    dataSaverRecommended,
    onTouchStart,
    onTouchEnd,
    enterPip,
    exitPip,
    toggleFullscreen,
  };
}
