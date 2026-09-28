import {
  PrismaClient,
  ReleaseLifecycleState,
  AnimeSyncStatus,
  EpisodeSyncStatus,
} from '@prisma/client';
import { mappingService } from '../mapping';
import { anilistService } from '../anilist';
import { providerRegistry } from '../streaming';
import { getSyncAdapter } from './adapters';
import type { ProviderName } from '../streaming/Provider';

export class SyncOrchestrator {
  constructor(private readonly prisma: PrismaClient) {}

  async runFullCatalogSync(provider: string): Promise<{
    success: boolean;
    processed: number;
    failed: number;
    deferred: number;
    error?: string;
  }> {
    const adapter = getSyncAdapter(provider);

    if (!adapter) {
      throw new Error(`No sync adapter found for provider: ${provider}`);
    }

    const catalog = await adapter.fetchFullCatalog();

    let processed = 0;
    let failed = 0;
    let deferred = 0;

    for (const meta of catalog) {
      try {
        const existingAnime = await this.prisma.anime.findFirst({
          where: {
            providerMappings: {
              path: [provider],
              equals: meta.providerAnimeId,
            },
          },
        });

        if (existingAnime) {
          await this.syncAnimeByAniListId(existingAnime.anilistId);
          processed++;
        } else {
          deferred++;
        }
      } catch (error) {
        failed++;
        console.error(
          `[SyncOrchestrator] Failed to sync ${meta.providerAnimeId}:`,
          error,
        );
      }
    }

    return {
      success: true,
      processed,
      failed,
      deferred,
    };
  }

  async processNewReleases(
    provider: string,
    limit = 500,
  ): Promise<{
    success: boolean;
    processed: number;
    failed: number;
    deferred: number;
  }> {
    const releases = await this.prisma.discoveredRelease.findMany({
      where: {
        provider,
        lifecycleState: ReleaseLifecycleState.DISCOVERED,
      },
      take: limit,
      orderBy: {
        firstSeenAt: 'asc',
      },
    });

    let processed = 0;
    let failed = 0;
    let deferred = 0;

    for (const release of releases) {
      try {
        const existingAnime = await this.prisma.anime.findFirst({
          where: {
            providerMappings: {
              path: [provider],
              equals: release.providerAnimeId,
            },
          },
        });

        if (existingAnime) {
          await this.syncAnimeByAniListId(existingAnime.anilistId);
          processed++;
        } else {
          deferred++;
        }
      } catch (error) {
        failed++;
        console.error(
          `[SyncOrchestrator] Failed to process release ${release.providerAnimeId}:`,
          error,
        );
      }
    }

    return {
      success: true,
      processed,
      failed,
      deferred,
    };
  }

  async syncAnimeByAniListId(anilistId: number): Promise<void> {
    const mapping = await mappingService.resolveProviderId(anilistId);

    if (!mapping) {
      return;
    }

    const anilistDetail = await anilistService.getDetail(anilistId);
    const anilist = anilistDetail.media;

    const existingAnime = await this.prisma.anime.findUnique({
      where: { anilistId },
    });

    const existingMappings =
      (existingAnime?.providerMappings as Record<string, string>) || {};

    const mergedMappings = {
      ...existingMappings,
      [mapping.providerName]: mapping.providerId,
    };

    const anime = await this.prisma.anime.upsert({
      where: { anilistId },
      update: {
        title: anilist.title.romaji,
        synonyms: anilist.synonyms || [],
        image: anilist.coverImage?.large,
        description: anilist.description,
        type: anilist.format,
        status: anilist.status,
        episodeCount: anilist.episodes,
        season: anilist.season,
        seasonYear: anilist.seasonYear,
        genres: anilist.genres || [],
        providerMappings: mergedMappings,
        syncStatus: AnimeSyncStatus.SYNCING,
      },
      create: {
        anilistId,
        title: anilist.title.romaji,
        synonyms: anilist.synonyms || [],
        image: anilist.coverImage?.large,
        description: anilist.description,
        type: anilist.format,
        status: anilist.status,
        episodeCount: anilist.episodes,
        season: anilist.season,
        seasonYear: anilist.seasonYear,
        genres: anilist.genres || [],
        providerMappings: {
          [mapping.providerName]: mapping.providerId,
        },
        syncStatus: AnimeSyncStatus.SYNCING,
      },
    });

    await this.syncEpisodesForProvider(
      anime.id,
      mapping.providerName,
      mapping.providerId,
    );

    await this.prisma.anime.update({
      where: { id: anime.id },
      data: {
        syncStatus: AnimeSyncStatus.MAPPED,
        lastSyncedAt: new Date(),
      },
    });
  }

  async syncEpisodesForProvider(
    animeId: number,
    provider: string,
    providerAnimeId: string,
  ): Promise<void> {
    const adapter = getSyncAdapter(provider);

    if (!adapter) {
      throw new Error(`No sync adapter found for provider: ${provider}`);
    }

    const episodeList = await adapter.fetchEpisodeList(providerAnimeId);

    for (const ep of episodeList) {
      if (!ep.providerEpisodeId) {
        continue;
      }

      await this.prisma.episode.upsert({
        where: {
          animeId_number: {
            animeId,
            number: ep.number,
          },
        },
        update: {
          providerEpisodeIds: {
            [provider]: ep.providerEpisodeId,
          },
          syncStatus: EpisodeSyncStatus.MAPPED,
        },
        create: {
          animeId,
          number: ep.number,
          title: ep.title,
          isFiller: ep.isFiller,
          airDate: ep.airDate,
          providerEpisodeIds: {
            [provider]: ep.providerEpisodeId,
          },
          syncStatus: EpisodeSyncStatus.MAPPED,
        },
      });
    }
  }

  async checkAvailability(episodeId: string): Promise<boolean> {
    const episode = await this.prisma.episode.findUnique({
      where: { id: episodeId },
      include: { anime: true },
    });

    if (!episode || episode.syncStatus === EpisodeSyncStatus.AVAILABLE) {
      return true;
    }

    const providerMappings = episode.anime.providerMappings;

    if (
      typeof providerMappings !== 'object' ||
      providerMappings === null
    ) {
      return false;
    }

    const providerEpisodeIds = episode.providerEpisodeIds as Record<string, string> | null;

    for (const [provider, providerAnimeId] of Object.entries(
      providerMappings as Record<string, string>,
    )) {
      const providerEpisodeId = providerEpisodeIds?.[provider];
      if (!providerEpisodeId) {
        console.warn(`No providerEpisodeId found for ${provider} on episode ${episode.number}`);
        continue;
      }

      try {
        const sources =
          await providerRegistry.getEpisodeSourcesFromProvider(
            provider as ProviderName,
            providerAnimeId,
            providerEpisodeId,
          );

        if (sources.length > 0) {
          await this.prisma.episode.update({
            where: { id: episodeId },
            data: {
              syncStatus: EpisodeSyncStatus.AVAILABLE,
              lastSyncedAt: new Date(),
            },
          });

          return true;
        }
      } catch (error) {
        console.warn(
          `Availability check failed for ${provider}:${episode.number}`,
          error,
        );
      }
    }

    return false;
  }
}
