import { PrismaClient, EpisodeSyncStatus } from '@prisma/client';
import { providerRegistry } from '../streaming';
import { discoveryLogger } from '../../utils/logger';
import type { ProviderName } from '../streaming/Provider';

const logger = discoveryLogger.child({ service: 'availability-pipeline' });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class AvailabilityPipeline {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async checkAvailability(episodeId: string): Promise<boolean> {
    const episode = await this.prisma.episode.findUnique({ 
      where: { id: episodeId }, 
      include: { anime: true } 
    });
    
    if (!episode || episode.syncStatus === 'AVAILABLE') return true;

    const providerMappings = episode.anime.providerMappings;
    if (!isPlainObject(providerMappings)) {
      return false;
    }

    const providerEpisodeIds = episode.providerEpisodeIds as Record<string, string> | null;

    for (const [provider, providerAnimeId] of Object.entries(providerMappings)) {
      if (typeof providerAnimeId !== 'string') continue;

      const providerEpisodeId = providerEpisodeIds?.[provider];
      if (!providerEpisodeId) {
        console.warn(`No providerEpisodeId found for ${provider} on episode ${episode.number}`);
        continue;
      }
      
      try {
        const sources = await providerRegistry.getEpisodeSourcesFromProvider(
          provider as ProviderName,
          providerAnimeId, 
          providerEpisodeId
        );
        
        if (sources.length > 0) {
          await this.prisma.episode.update({
            where: { id: episodeId },
            data: { syncStatus: 'AVAILABLE', lastSyncedAt: new Date() }
          });
          return true;
        }
      } catch (error) {
        console.warn(`Availability check failed for ${provider}:${episode.number}`, error);
      }
    }
    
    return false;
  }

  async checkAvailabilityForAnime(animeId: number): Promise<void> {
    const episodes = await this.prisma.episode.findMany({
      where: { animeId, syncStatus: 'MAPPED' }
    });

    for (const episode of episodes) {
      await this.checkAvailability(episode.id);
    }
  }
}

export const availabilityPipeline = new AvailabilityPipeline(new (require('@prisma/client').PrismaClient)());