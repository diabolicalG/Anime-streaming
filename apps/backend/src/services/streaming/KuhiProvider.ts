import type {
  StreamingProvider,
  ProviderSearchResult,
  ProviderDetail,
  EpisodeInfo,
  StreamSource,
  SubtitleTrack,
} from './Provider';

interface KuhiSearchItem {
  id: number;
  title?: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string; extraLarge?: string };
  format?: string;
  season?: string;
  seasonYear?: number;
  episodes?: number | null;
  status?: string;
}

interface KuhiSearchResponse {
  results?: KuhiSearchItem[];
}

interface KuhiEpisodeItem {
  number: number;
  title?: string;
  filler?: boolean;
}

interface KuhiEpisodesResponse {
  providers?: Record<
    string,
    {
      meta?: { id?: string; title?: string; source?: string };
      episodes?: { sub?: KuhiEpisodeItem[]; dub?: KuhiEpisodeItem[] };
    }
  >;
}

interface KuhiSubtitle {
  url: string;
  label?: string;
  srclang?: string;
  default?: boolean;
}

interface KuhiStream {
  url: string;
  type?: string;
  referer?: string;
  headers?: Record<string, string>;
  subtitles?: KuhiSubtitle[];
}

interface KuhiExtractResponse {
  streams?: KuhiStream[];
  subtitles?: KuhiSubtitle[];
}

function mapFormat(format?: string): 'TV' | 'MOVIE' | 'OVA' | 'SPECIAL' {
  switch ((format || '').toUpperCase()) {
    case 'TV':
      return 'TV';
    case 'MOVIE':
      return 'MOVIE';
    case 'OVA':
      return 'OVA';
    case 'SPECIAL':
      return 'SPECIAL';
    case 'MUSIC':
      return 'SPECIAL';
    case 'ONA':
    case '':
    default:
      return 'TV';
  }
}

function mapSubtitles(subs?: KuhiSubtitle[]): SubtitleTrack[] {
  if (!subs || subs.length === 0) return [];
  return subs.map((s) => ({
    url: s.url,
    lang: s.srclang || 'und',
    label: s.label || s.srclang || 'Unknown',
    default: s.default ?? false,
  }));
}

export class KuhiProvider implements StreamingProvider {
  readonly name = 'kuhi';
  readonly priority = 10;
  readonly supportsDub = true;
  readonly supportsSub = true;

  readonly baseUrl: string;

  private static readonly FAST_PROVIDERS = ['anibd', 'kaa'] as const;
  private static readonly PER_CALL_TIMEOUT_MS = 30000;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async fetchJson<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`[kuhi] ${path} failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async search(query: string, page = 1): Promise<ProviderSearchResult[]> {
    const data = await this.fetchJson<KuhiSearchResponse>(
      `/anime/search?query=${encodeURIComponent(query)}&page=${page}`,
    );

    return (data.results || []).map((r) => ({
      id: String(r.id),
      title: r.title?.romaji || r.title?.english || r.title?.native || '',
      image: r.coverImage?.extraLarge || r.coverImage?.large,
      type: mapFormat(r.format),
      episodes: r.episodes ?? undefined,
      status: r.status === 'RELEASING' ? 'ongoing' : 'completed',
      year: r.seasonYear,
      season: r.season,
    }));
  }

  async getAnimeInfo(providerId: string): Promise<ProviderDetail> {
    const data = await this.fetchJson<KuhiEpisodesResponse>(
      `/anime/episodes/${encodeURIComponent(providerId)}`,
    );

    const byNumber = new Map<number, EpisodeInfo>();
    for (const provider of Object.values(data.providers || {})) {
      const subEpisodes = provider.episodes?.sub || [];
      for (const ep of subEpisodes) {
        if (!byNumber.has(ep.number)) {
          byNumber.set(ep.number, {
            id: String(ep.number),
            number: ep.number,
            title: ep.title,
            filler: ep.filler,
            sources: [],
          });
        }
      }
      if (byNumber.size > 0) break;
    }

    const episodesList = Array.from(byNumber.values()).sort((a, b) => a.number - b.number);

    return {
      id: providerId,
      title: '',
      synonyms: [],
      image: '',
      description: '',
      type: '',
      status: '',
      episodes: episodesList.length,
      genres: [],
      episodesList,
    };
  }

  private mapStreams(
    streams: KuhiStream[] | undefined,
    fallbackSubtitles: SubtitleTrack[],
  ): StreamSource[] {
    return (streams || [])
      .filter((s) => s.type !== 'embed')
      .map((s) => {
        const trackSubtitles = mapSubtitles(s.subtitles);
        return {
          url: s.url,
          quality: 'auto',
          isM3U8: s.url.includes('.m3u8') || s.type === 'hls',
          headers: s.headers,
          subtitles:
            trackSubtitles.length > 0 ? trackSubtitles : fallbackSubtitles,
          referrer: s.referer,
        };
      });
  }

  async getEpisodeSources(
    providerId: string,
    providerEpisodeId: string,
  ): Promise<StreamSource[]> {
    const base =
      `${this.baseUrl}/anime/extract/${encodeURIComponent(providerId)}` +
      `?e=${encodeURIComponent(providerEpisodeId)}&type=sub`;

    const attempt = async (prov: string): Promise<StreamSource[]> => {
      const res = await fetch(`${base}&provider=${prov}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(KuhiProvider.PER_CALL_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`[kuhi] ${prov} status ${res.status}`);
      const data = (await res.json()) as KuhiExtractResponse;
      const streams = this.mapStreams(
        data.streams,
        mapSubtitles(data.subtitles),
      );
      if (streams.length === 0) {
        throw new Error(`[kuhi] ${prov} returned 0 streams`);
      }
      return streams;
    };

    try {
      return await Promise.any(KuhiProvider.FAST_PROVIDERS.map(attempt));
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
