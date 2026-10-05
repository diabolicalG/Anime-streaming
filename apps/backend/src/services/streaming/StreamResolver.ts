import { providerRegistry } from './index';
import { StreamSource, SubtitleTrack } from './Provider';

export interface NormalizedStreamSource extends StreamSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  resolution?: '240p' | '360p' | '480p' | '720p' | '1080p' | '4K';
  qualityTier: 'SD' | 'HD' | 'FHD' | 'UHD';
  sourceLabel?: string;
  provider?: string;
  subtitleTracks?: SubtitleTrack[];
}

export interface StreamResolutionError {
  code: 'NO_SOURCES' | 'PROVIDER_UNAVAILABLE' | 'CIRCUIT_BREAKER_OPEN' | 'VALIDATION_ERROR';
  failureType: 'NONE' | 'RESOLUTION' | 'SOURCE' | 'PLAYBACK';
  message: string;
  retryable: boolean;
  originalProvider?: string;
}

export interface StreamResolutionResult {
  sources: NormalizedStreamSource[];
  error?: StreamResolutionError;
  resolvedProvider?: string;
}

export type DelayFn = (ms: number, signal?: AbortSignal) => Promise<void>;

export class StreamResolver {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_BACKOFF_MS = 500;

  private static defaultDelay: DelayFn = (ms, signal) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      if (signal) {
        const onAbort = () => {
          clearTimeout(timeout);
          const err = new Error('Aborted') as Error & { name: 'AbortError' };
          err.name = 'AbortError';
          reject(err);
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }
    });

  async resolveSources(
    providerId: string | number,
    episode: number,
    providerEpisodeId?: string,
    options?: { signal?: AbortSignal; delay?: DelayFn },
  ): Promise<StreamResolutionResult> {
    const { signal, delay = StreamResolver.defaultDelay } = options || {};

    if (signal?.aborted) {
      const err = new Error('Aborted') as Error & { name: 'AbortError' };
      err.name = 'AbortError';
      throw err;
    }

    let rawSources: StreamSource[];

    try {
      if (!providerEpisodeId) {
        return {
          sources: [],
          error: {
            code: 'VALIDATION_ERROR',
            failureType: 'RESOLUTION',
            message: 'providerEpisodeId is required for episode source resolution',
            retryable: false,
          },
        };
      }
      rawSources = await providerRegistry.getEpisodeSourcesWithFallback(String(providerId), providerEpisodeId);
    } catch (error) {
      const err = error as Error;
      const isCircuitBreakerOpen = err.name === 'OpenCircuitError';

      return {
        sources: [],
        error: {
          code: isCircuitBreakerOpen ? 'CIRCUIT_BREAKER_OPEN' : 'PROVIDER_UNAVAILABLE',
          failureType: 'SOURCE',
          message: err.message || 'Unknown provider error',
          retryable: true,
        },
      };
    }

    if (signal?.aborted) {
      const err = new Error('Aborted') as Error & { name: 'AbortError' };
      err.name = 'AbortError';
      throw err;
    }

    if (rawSources.length === 0) {
      return {
        sources: [],
        error: {
          code: 'NO_SOURCES',
          failureType: 'RESOLUTION',
          message: 'No stream sources available for this episode',
          retryable: false,
        },
      };
    }

    const normalized = this.normalizeSources(rawSources);

    return { sources: normalized };
  }

  private normalizeSources(sources: StreamSource[]): NormalizedStreamSource[] {
    const seenUrls = new Set<string>();
    const deduped: NormalizedStreamSource[] = [];

    for (const source of sources) {
      if (seenUrls.has(source.url)) continue;
      seenUrls.add(source.url);

      const qualityTier = this.classifyQuality(source.quality);
      const resolution = this.resolutionFromTier(qualityTier);

      const subtitles: SubtitleTrack[] = source.subtitles?.map(st => ({
        url: st.url,
        lang: st.lang,
        label: st.label || st.lang.toUpperCase(),
        default: st.default,
      })) || [];

      deduped.push({
        ...source,
        subtitles,
        resolution,
        qualityTier,
        sourceLabel: source.referrer || undefined,
        provider: undefined,
      });
    }

    return deduped;
  }

  private classifyQuality(quality: string): 'SD' | 'HD' | 'FHD' | 'UHD' {
    const q = quality.toLowerCase();
    if (/^240p$/i.test(q) || /^360p$/i.test(q)) return 'SD';
    if (/^480p$/i.test(q) || /^720p$/i.test(q)) return 'HD';
    if (/^1080p$/i.test(q) || /^fullhd$/i.test(q)) return 'FHD';
    if (/^4k$/i.test(q) || /^2160p$/i.test(q) || /^uhd$/i.test(q)) return 'UHD';
    return 'HD';
  }

  private resolutionFromTier(tier: 'SD' | 'HD' | 'FHD' | 'UHD'): '240p' | '360p' | '480p' | '720p' | '1080p' | '4K' {
    switch (tier) {
      case 'SD':
        return '360p';
      case 'HD':
        return '480p';
      case 'FHD':
        return '1080p';
      case 'UHD':
        return '4K';
    }
  }

  async resolveWithRetry(
    providerId: string | number,
    episode: number,
    retries = StreamResolver.MAX_RETRIES,
    providerEpisodeId?: string,
    options?: { signal?: AbortSignal; delay?: DelayFn },
  ): Promise<StreamResolutionResult> {
    const { signal, delay = StreamResolver.defaultDelay } = options || {};

    let lastError: StreamResolutionError | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      if (signal?.aborted) {
        const err = new Error('Aborted') as Error & { name: 'AbortError' };
        err.name = 'AbortError';
        throw err;
      }

      const result = await this.resolveSources(providerId, episode, providerEpisodeId, { signal, delay });
      if (!result.error) return result;
      lastError = result.error;

      const shouldRetry = result.error!.retryable && attempt < retries - 1;

      if (shouldRetry) {
        const backoff = StreamResolver.BASE_BACKOFF_MS * Math.pow(2, attempt);
        await delay(backoff, signal);
        if (signal?.aborted) {
          const err = new Error('Aborted') as Error & { name: 'AbortError' };
          err.name = 'AbortError';
          throw err;
        }
      }
    }

    return {
      sources: [],
      error: lastError!,
    };
  }
}

export const streamResolver = new StreamResolver();