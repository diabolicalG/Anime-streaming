import { providerRegistry } from './index';
import { StreamSource, SubtitleTrack } from './Provider';

export interface NormalizedStreamSource {
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
  code: 'NO_SOURCES' | 'PROVIDER_UNAVAILABLE' | 'CIRCUIT_BREAKER_OPEN' | 'CACHE_MISS' | 'VALIDATION_ERROR';
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

export class StreamResolver {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_BACKOFF_MS = 500;

  async resolveSources(
    anilistId: number,
    episode: number,
    providerEpisodeId?: string,
  ): Promise<StreamResolutionResult> {
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
      rawSources = await providerRegistry.getEpisodeSourcesWithFallback(anilistId.toString(), providerEpisodeId);
    } catch (error) {
      return {
        sources: [],
        error: {
          code: 'PROVIDER_UNAVAILABLE',
          failureType: 'SOURCE',
          message: (error as Error).message || 'Unknown provider error',
          retryable: true,
        },
      };
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
    return sources.map(source => {
      const qualityTier = this.classifyQuality(source.quality);
      const resolution = this.resolutionFromTier(qualityTier);

      const subtitleTracks: SubtitleTrack[] = source.subtitles?.map(st => ({
        url: st.url,
        lang: st.lang,
        label: st.label || st.lang.toUpperCase(),
        default: st.default,
      })) || [];

      return {
        url: source.url,
        quality: source.quality,
        isM3U8: source.isM3U8,
        resolution,
        qualityTier,
        sourceLabel: source.referrer || undefined,
        provider: undefined,
        subtitleTracks,
      } as NormalizedStreamSource;
    });
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
    anilistId: number,
    episode: number,
    retries = StreamResolver.MAX_RETRIES,
    providerEpisodeId?: string,
  ): Promise<StreamResolutionResult> {
    let lastError: StreamResolutionError | undefined;

    for (let attempt = 0; attempt < retries; attempt++) {
      const result = await this.resolveSources(anilistId, episode, providerEpisodeId);
      if (!result.error) return result;
      lastError = result.error;

      const shouldRetry = result.error!.retryable && attempt < retries - 1;

      if (shouldRetry) {
        const backoff = StreamResolver.BASE_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    return {
      sources: [],
      error: lastError!,
    };
  }
}

export const streamResolver = new StreamResolver();