import { streamResolver, NormalizedStreamSource, StreamResolutionError, StreamResolutionResult } from './StreamResolver';
import { providerRegistry } from './index';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

describe('StreamResolver', () => {
  let originalGetEpisodeSourcesWithFallback: typeof providerRegistry.getEpisodeSourcesWithFallback;

  beforeEach(async () => {
    originalGetEpisodeSourcesWithFallback = providerRegistry.getEpisodeSourcesWithFallback;
    providerRegistry.getEpisodeSourcesWithFallback = async () => [
      {
        url: 'http://example.com/stream.m3u8',
        quality: '720p',
        isM3U8: true,
        headers: {},
        referrer: 'consumet',
        subtitles: [
          { url: 'http://example.com/subtitles.vtt', lang: 'en', label: 'English', default: false },
        ],
      },
    ];
  });

  afterEach(async () => {
    if (originalGetEpisodeSourcesWithFallback) {
      providerRegistry.getEpisodeSourcesWithFallback = originalGetEpisodeSourcesWithFallback;
    }
  });

  describe('resolveSources', () => {
    it('should resolve sources from ProviderRegistry', async () => {
      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.sources).toBeDefined();
      expect(Array.isArray(result.sources)).toBe(true);
      if (result.sources.length > 0) {
        const source = result.sources[0];
        expect(source).toHaveProperty('url');
        expect(source).toHaveProperty('quality');
        expect(source).toHaveProperty('isM3U8');
        expect(source).toHaveProperty('qualityTier');
        expect(source.qualityTier).toBeDefined();
      }
    });

    it('should return VALIDATION_ERROR when providerEpisodeId is missing', async () => {
      const result = await streamResolver.resolveSources(255997, 1);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.error?.failureType).toBe('RESOLUTION');
      expect(result.error?.message).toContain('providerEpisodeId is required');
      expect(result.sources).toHaveLength(0);
    });

    it('should return NO_SOURCES error with RESOLUTION failureType', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [];

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.error?.code).toBe('NO_SOURCES');
      expect(result.error?.failureType).toBe('RESOLUTION');
      expect(result.sources).toHaveLength(0);
    });

    it('should return PROVIDER_UNAVAILABLE error with SOURCE failureType', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        throw new Error('Provider timeout');
      };

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.error?.code).toBe('PROVIDER_UNAVAILABLE');
      expect(result.error?.failureType).toBe('SOURCE');
      expect(result.sources).toHaveLength(0);
    });

    it('should return CIRCUIT_BREAKER_OPEN when circuit breaker is open', async () => {
      const cbError = new Error('Circuit breaker is open') as Error & { name: string };
      cbError.name = 'OpenCircuitError';
      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        throw cbError;
      };

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.error?.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(result.error?.failureType).toBe('SOURCE');
      expect(result.error?.retryable).toBe(true);
      expect(result.sources).toHaveLength(0);
    });

    it('should throw AbortError before any provider call when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      let providerCalled = false;
      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        providerCalled = true;
        return [];
      };

      await expect(streamResolver.resolveSources(255997, 1, 'test-episode-id', { signal: controller.signal }))
        .rejects.toMatchObject({ name: 'AbortError' });
      expect(providerCalled).toBe(false);
    });

    it('should normalize quality tiers from source data', async () => {
      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      for (const source of result.sources) {
        expect(['SD', 'HD', 'FHD', 'UHD']).toContain(source.qualityTier);
        expect(typeof source.resolution).toBe('string');
      }
    });

    it('should produce SD quality from 360p source quality', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [
        {
          url: 'http://example.com/stream.m3u8',
          quality: '360p',
          isM3U8: true,
          headers: {},
          referrer: 'consumet',
          subtitles: [],
        },
      ];

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.sources[0].qualityTier).toBe('SD');
      expect(result.sources[0].resolution).toBe('360p');
    });

    it('should produce HD quality from 720p source quality', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [
        {
          url: 'http://example.com/stream.m3u8',
          quality: '720p',
          isM3U8: true,
          headers: {},
          referrer: 'consumet',
          subtitles: [],
        },
      ];

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.sources[0].qualityTier).toBe('HD');
      expect(result.sources[0].resolution).toBe('480p');
    });

    it('should produce FHD quality from 1080p source quality', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [
        {
          url: 'http://example.com/stream.m3u8',
          quality: '1080p',
          isM3U8: true,
          headers: {},
          referrer: 'consumet',
          subtitles: [],
        },
      ];

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.sources[0].qualityTier).toBe('FHD');
      expect(result.sources[0].resolution).toBe('1080p');
    });

    it('should produce UHD quality from 2160p source quality', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [
        {
          url: 'http://example.com/stream.m3u8',
          quality: '2160p',
          isM3U8: true,
          headers: {},
          referrer: 'consumet',
          subtitles: [],
        },
      ];

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.sources[0].qualityTier).toBe('UHD');
      expect(result.sources[0].resolution).toBe('4K');
    });
  });

  describe('resolveWithRetry', () => {
    it('should return error when all retries fail with failureType preserved', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        throw new Error('Provider unavailable');
      };

      const result = await streamResolver.resolveWithRetry(255997, 1, 1, 'test-episode-id');
      expect(result.sources).toHaveLength(0);
      expect(result.error).toBeDefined();
      expect(result.error!.retryable).toBe(true);
      expect(result.error!.failureType).toBe('SOURCE');
    });

    it('should retry on retryable errors and succeed on later attempt', async () => {
      let attemptCount = 0;
      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Provider unavailable on attempt ' + attemptCount);
        }
        return [
          { url: 'http://example.com', quality: '720p', isM3U8: false, headers: {}, referrer: 'consumet', subtitles: [] },
        ];
      };

      const result = await streamResolver.resolveWithRetry(255997, 1, 3, 'test-episode-id');
      expect(result.sources.length).toBeGreaterThan(0);
      expect(attemptCount).toBeGreaterThanOrEqual(2);
    });

    it('should preserve RESOLUTION failureType when NO_SOURCES exhausted on retry', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [];

      const result = await streamResolver.resolveWithRetry(255997, 1, 3, 'test-episode-id');
      expect(result.sources).toHaveLength(0);
      expect(result.error).toBeDefined();
      expect(result.error!.failureType).toBe('RESOLUTION');
    });

    it('should throw AbortError when called with already-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(streamResolver.resolveWithRetry(255997, 1, 3, 'test-episode-id', { signal: controller.signal }))
        .rejects.toThrow('Aborted');
    });

    it('should abort mid-backoff and not perform second attempt', async () => {
      const controller = new AbortController();
      let attemptCount = 0;
      let delayResolve: (value: void | PromiseLike<void>) => void;
      let delayReject: (reason?: any) => void;
      let delayCalled = false;

      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        attemptCount++;
        throw new Error('Provider unavailable');
      };

      const controllableDelay = vi.fn().mockImplementation(async () => {
        delayCalled = true;
        return new Promise<void>((resolve, reject) => {
          delayResolve = resolve;
          delayReject = reject;
          if (controller.signal.aborted) {
            const err = new Error('Aborted') as Error & { name: 'AbortError' };
            err.name = 'AbortError';
            reject(err);
          }
        });
      });

      const promise = streamResolver.resolveWithRetry(255997, 1, 3, 'test-episode-id', {
        signal: controller.signal,
        delay: controllableDelay,
      });

      // Wait for first attempt to fail and delay to be called
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(attemptCount).toBe(1);
      expect(delayCalled).toBe(true);

      // Abort during backoff
      controller.abort();
      delayReject!(new Error('Aborted'));

      await expect(promise).rejects.toThrow('Aborted');
      expect(attemptCount).toBe(1);
    });

    it('should surface CIRCUIT_BREAKER_OPEN error from registry', async () => {
      const cbError = new Error('Circuit breaker is open') as Error & { name: string };
      cbError.name = 'OpenCircuitError';

      providerRegistry.getEpisodeSourcesWithFallback = async () => {
        throw cbError;
      };

      const result = await streamResolver.resolveWithRetry(255997, 1, 3, 'test-episode-id');
      expect(result.error?.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(result.error?.failureType).toBe('SOURCE');
      expect(result.error?.retryable).toBe(true);
    });
  });

  describe('source normalization', () => {
    it('should normalize subtitle tracks correctly', async () => {
      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      for (const source of result.sources) {
        if (source.subtitleTracks && source.subtitleTracks.length > 0) {
          for (const st of source.subtitleTracks) {
            expect(st).toHaveProperty('url');
            expect(st).toHaveProperty('lang');
            expect(st).toHaveProperty('label');
          }
        }
      }
    });

    it('should set sourceLabel from referrer when available', async () => {
      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      for (const source of result.sources) {
        if (source.sourceLabel) {
          expect(typeof source.sourceLabel).toBe('string');
        }
      }
    });

    it('should dedupe sources by URL keeping first occurrence', async () => {
      providerRegistry.getEpisodeSourcesWithFallback = async () => [
        { url: 'http://example.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, referrer: 'consumet', subtitles: [] },
        { url: 'http://example.com/stream.m3u8', quality: '1080p', isM3U8: true, headers: {}, referrer: 'consumet', subtitles: [] },
        { url: 'http://other.com/stream.mp4', quality: '480p', isM3U8: false, headers: {}, referrer: 'anivexa', subtitles: [] },
      ];

      const result = await streamResolver.resolveSources(255997, 1, 'test-episode-id');
      expect(result.sources).toHaveLength(2);
      expect(result.sources[0].url).toBe('http://example.com/stream.m3u8');
      expect(result.sources[0].quality).toBe('720p');
      expect(result.sources[1].url).toBe('http://other.com/stream.mp4');
    });
  });
});