import axios, { AxiosInstance } from 'axios';
import { StreamingProvider, StreamSource, ProviderSearchResult, ProviderDetail, EpisodeInfo } from './Provider';

interface AnivexaSearchResult {
  id: string;
  title: string;
  image: string;
  type: string;
  episodes: number;
  status: string;
}

interface AnivexaAnimeInfo {
  id: string;
  title: string;
  synonyms: string[];
  image: string;
  cover: string;
  description: string;
  type: string;
  status: string;
  episodes: number;
  genres: string[];
  episodesList: { number: number; title: string; id: string }[];
}

interface AnivexaSource {
  url: string;
  quality: string;
  is_m3u8: boolean;
  headers?: Record<string, string>;
  subtitles?: { url: string; lang: string }[];
}

export class AnivexaProvider implements StreamingProvider {
  readonly name = 'anivexa' as const;
  readonly baseUrl: string;
  readonly priority = 2;
  readonly supportsDub = false;
  readonly supportsSub = true;

  private client: AxiosInstance;

  constructor(baseUrl: string = 'https://api.anivexa.com') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: { 'User-Agent': 'anime-streaming/1.0' },
    });
  }

  async search(query: string, page = 1): Promise<ProviderSearchResult[]> {
    const { data } = await this.client.get('/search', { params: { q: query, page } });
    return data.results?.map((r: AnivexaSearchResult) => ({
      id: r.id,
      title: r.title,
      image: r.image,
      type: r.type as any,
      episodes: r.episodes,
      status: r.status as any,
    })) || [];
  }

  async getAnimeInfo(providerId: string): Promise<ProviderDetail> {
    const { data } = await this.client.get(`/anime/${providerId}`);
    const info: AnivexaAnimeInfo = data;

    const episodesList: EpisodeInfo[] = info.episodesList.map((ep) => ({
      number: ep.number,
      title: ep.title,
      filler: false,
      sources: [],
    }));

    return {
      id: info.id,
      title: info.title,
      synonyms: info.synonyms,
      image: info.image,
      cover: info.cover,
      description: info.description,
      type: info.type,
      status: info.status,
      episodes: info.episodes,
      genres: info.genres,
      episodesList,
    };
  }

  async getEpisodeSources(providerId: string, episode: number): Promise<StreamSource[]> {
    const { data } = await this.client.get(`/episode/${providerId}-ep-${episode}`);
    return data.sources?.map((s: AnivexaSource) => ({
      url: s.url,
      quality: s.quality,
      isM3U8: s.is_m3u8,
      headers: s.headers,
      subtitles: s.subtitles?.map((sub) => ({
        url: sub.url,
        lang: sub.lang,
        label: sub.lang.toUpperCase(),
      })),
    })) || [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/search', { params: { q: 'test', page: 1 }, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
