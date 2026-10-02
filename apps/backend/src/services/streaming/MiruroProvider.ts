import type {
  StreamingProvider,
  ProviderSearchResult,
  ProviderDetail,
  EpisodeInfo,
  StreamSource,
  SubtitleTrack,
} from './Provider';

interface MiruroSearchTitle {
  romaji?: string;
  english?: string;
}

interface MiruroSearchItem {
  id?: string | number;
  slug?: string;
  anilistId?: string | number;
  title?: MiruroSearchTitle | string;
  image?: string;
  coverImage?: string;
  format?: string;
  type?: string;
  episodes?: number;
  status?: string;
}

interface MiruroSearchResults {
  results?: MiruroSearchItem[];
  data?: MiruroSearchItem[];
}

type MiruroSearchResponse = MiruroSearchItem[] | MiruroSearchResults;

interface MiruroEpisodeItem {
  number?: number;
  title?: string;
  filler?: boolean;
}

interface MiruroInfoResponse {
  id?: string;
  title?: string;
  synonyms?: string[];
  image?: string;
  cover?: string;
  description?: string;
  type?: string;
  status?: string;
  genres?: string[];
  episodesList?: MiruroEpisodeItem[];
  episodes?: MiruroEpisodeItem[];
}

interface MiruroSubtitle {
  url?: string;
  label?: string;
  lang?: string;
  srclang?: string;
  default?: boolean;
}

interface MiruroStream {
  url?: string;
  quality?: string;
  type?: string;
  referer?: string;
  referrer?: string;
  headers?: Record<string, string>;
  subtitles?: MiruroSubtitle[];
}

interface MiruroWatchResponse {
  streams?: MiruroStream[];
  sources?: MiruroStream[];
}

export class MiruroProvider implements StreamingProvider {
  readonly name = 'miruro';
  readonly baseUrl: string;
  readonly priority = 12;
  readonly supportsDub = true;
  readonly supportsSub = true;

  private static readonly SEARCH_TIMEOUT_MS = 15000;
  private static readonly INFO_TIMEOUT_MS = 15000;
  private static readonly EXTRACT_TIMEOUT_MS = 30000;
  private static readonly HEALTH_TIMEOUT_MS = 5000;

  private static readonly ENDPOINTS = {
    // TODO: UNVERIFIED placeholders. Check against the real Miruro API
    // after install and adjust.
    health: '/',
    search: '/search',
    info: '/info',
    watch: '/watch',
  } as const;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async fetchJson<T>(
    path: string,
    timeoutMs: number,
    operation: string,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new Error(
        `[miruro] ${operation} request failed: ${(error as Error).message}`,
      );
    }
    if (!res.ok) {
      throw new Error(`[miruro] ${operation} failed: HTTP ${res.status}`);
    }
    try {
      return (await res.json()) as T;
    } catch (error) {
      throw new Error(
        `[miruro] ${operation} returned invalid JSON: ${(error as Error).message}`,
      );
    }
  }

  private mapFormat(format?: string): 'TV' | 'MOVIE' | 'OVA' | 'SPECIAL' {
    switch ((format || '').toUpperCase()) {
      case 'TV':
        return 'TV';
      case 'MOVIE':
        return 'MOVIE';
      case 'OVA':
        return 'OVA';
      case 'SPECIAL':
        return 'SPECIAL';
      default:
        return 'TV';
    }
  }

  // TODO: unverified response shape
  private mapSearchItem(item: MiruroSearchItem): ProviderSearchResult | null {
    const id = item.slug ?? String(item.id ?? item.anilistId ?? '');
    if (!id) return null;

    const title =
      typeof item.title === 'string'
        ? item.title
        : (item.title?.romaji ?? item.title?.english ?? '');

    const status = (item.status || '').toLowerCase();

    return {
      id,
      title,
      image: item.image ?? item.coverImage ?? undefined,
      type: this.mapFormat(item.format ?? item.type),
      episodes: item.episodes ?? undefined,
      status:
        status === 'releasing' || status === 'ongoing' ? 'ongoing' : 'completed',
    };
  }

  async search(query: string, page = 1): Promise<ProviderSearchResult[]> {
    const data = await this.fetchJson<MiruroSearchResponse>(
      `${MiruroProvider.ENDPOINTS.search}` +
        `?q=${encodeURIComponent(query)}&page=${page}`,
      MiruroProvider.SEARCH_TIMEOUT_MS,
      'search',
    );

    // TODO: unverified response shape
    const items = Array.isArray(data) ? data : data.results || data.data || [];

    return items
      .map((item) => this.mapSearchItem(item))
      .filter((item): item is ProviderSearchResult => item !== null);
  }

  // TODO: unverified response shape
  private mapAnimeInfo(providerId: string, data: MiruroInfoResponse): ProviderDetail {
    const rawEpisodes = Array.isArray(data.episodesList)
      ? data.episodesList
      : Array.isArray(data.episodes)
        ? data.episodes
        : [];

    const byNumber = new Map<number, EpisodeInfo>();
    for (const ep of rawEpisodes) {
      const number = Number(ep.number);
      if (!Number.isFinite(number)) continue;
      if (!byNumber.has(number)) {
        byNumber.set(number, {
          id: String(number),
          number,
          title: ep.title,
          filler: ep.filler,
          sources: [],
        });
      }
    }

    const episodesList = Array.from(byNumber.values()).sort(
      (a, b) => a.number - b.number,
    );

    return {
      id: data.id || providerId,
      title: data.title || '',
      synonyms: data.synonyms || [],
      image: data.image || '',
      cover: data.cover,
      description: data.description || '',
      type: data.type || '',
      status: data.status || '',
      episodes: episodesList.length,
      genres: data.genres || [],
      episodesList,
    };
  }

  async getAnimeInfo(providerId: string): Promise<ProviderDetail> {
    const data = await this.fetchJson<MiruroInfoResponse>(
      `${MiruroProvider.ENDPOINTS.info}/${encodeURIComponent(providerId)}`,
      MiruroProvider.INFO_TIMEOUT_MS,
      'info',
    );

    return this.mapAnimeInfo(providerId, data);
  }

  // TODO: unverified response shape
  private mapSubtitle(sub: MiruroSubtitle): SubtitleTrack | null {
    if (!sub.url) return null;
    return {
      url: sub.url,
      lang: sub.srclang || sub.lang || 'und',
      label: sub.label || sub.srclang || 'Unknown',
      default: sub.default ?? false,
    };
  }

  // TODO: unverified response shape
  private mapSubtitles(subs?: MiruroSubtitle[]): SubtitleTrack[] {
    if (!subs || subs.length === 0) return [];
    return subs
      .map((sub) => this.mapSubtitle(sub))
      .filter((track): track is SubtitleTrack => track !== null);
  }

  // TODO: unverified response shape
  private mapStream(stream: MiruroStream): StreamSource | null {
    if (!stream.url) return null;
    return {
      url: stream.url,
      quality: stream.quality ?? 'auto',
      isM3U8: stream.url.includes('.m3u8') || stream.type === 'hls',
      headers: stream.headers,
      subtitles: this.mapSubtitles(stream.subtitles),
      referrer: stream.referer ?? stream.referrer,
    };
  }

  // TODO: unverified response shape
  private mapStreams(data: MiruroWatchResponse): StreamSource[] {
    const streams = data.streams || data.sources || [];
    return streams
      .map((stream) => this.mapStream(stream))
      .filter((source): source is StreamSource => source !== null);
  }

  async getEpisodeSources(
    providerId: string,
    providerEpisodeId: string,
  ): Promise<StreamSource[]> {
    const data = await this.fetchJson<MiruroWatchResponse>(
      `${MiruroProvider.ENDPOINTS.watch}/${encodeURIComponent(providerId)}` +
        `?ep=${encodeURIComponent(providerEpisodeId)}`,
      MiruroProvider.EXTRACT_TIMEOUT_MS,
      'extract',
    );

    return this.mapStreams(data);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}${MiruroProvider.ENDPOINTS.health}`,
        { signal: AbortSignal.timeout(MiruroProvider.HEALTH_TIMEOUT_MS) },
      );
      return res.ok;
    } catch {
      return false;
    }
  }
}