import axios, { AxiosInstance } from 'axios';
import { StreamingProvider, StreamSource, ProviderSearchResult, ProviderDetail, EpisodeInfo } from './Provider';

interface ConsumetEpisode {
  id: string;
  number: number;
  title: string;
  isFiller: boolean;
}

interface ConsumetAnimeInfo {
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
  season: string;
  releaseDate: string;
  episodesList: ConsumetEpisode[];
}

interface ConsumetSource {
  url: string;
  quality: string;
  isM3U8: boolean;
  headers?: Record<string, string>;
  subtitles?: { url: string; lang: string }[];
}

export class ConsumetProvider implements StreamingProvider {
  readonly name = 'consumet' as const;
  readonly baseUrl: string;
  readonly priority = 1;
  readonly supportsDub = true;
  readonly supportsSub = true;

  private client: AxiosInstance;

  constructor(baseUrl: string = 'https://api.consumet.org') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: { 'User-Agent': 'anime-streaming/1.0' },
    });
  }

  async search(query: string, page = 1): Promise<ProviderSearchResult[]> {
    const { data } = await this.client.get('/anime/gogoanime/search', {
      params: { query, page },
    });
    return data.results?.map((r: any) => ({
      id: r.id,
      title: r.title,
      image: r.image,
      type: r.type,
      episodes: r.episodes,
      status: r.status,
    })) || [];
  }

  async getAnimeInfo(providerId: string): Promise<ProviderDetail> {
    const { data } = await this.client.get(`/anime/gogoanime/info/${providerId}`);
    const info: ConsumetAnimeInfo = data;

    const episodesList: EpisodeInfo[] = info.episodesList.map((ep) => ({
      id: ep.id,
      number: ep.number,
      title: ep.title,
      filler: ep.isFiller,
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
      season: info.season,
      year: info.releaseDate ? new Date(info.releaseDate).getFullYear() : undefined,
      episodesList,
    };
  }

  async getEpisodeSources(providerId: string, providerEpisodeId: string): Promise<StreamSource[]> {
    const { data } = await this.client.get('/anime/gogoanime/watch', {
      params: { episodeId: providerEpisodeId },
    });

    return data.sources?.map((s: ConsumetSource) => ({
      url: s.url,
      quality: s.quality,
      isM3U8: s.isM3U8,
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
      await this.client.get('/anime/gogoanime/search', { params: { query: 'test', page: 1 }, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
