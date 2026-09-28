import type { ReleaseLifecycleState } from '@prisma/client';

export enum SyncJobType {
  FULL_CATALOG = 'FULL_CATALOG',
  INCREMENTAL_EPISODES = 'INCREMENTAL_EPISODES',
  BACKFILL = 'BACKFILL',
  REPAIR = 'REPAIR',
}

export enum SyncJobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  PARTIAL = 'PARTIAL',
}

export enum AnimeSyncStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  MAPPED = 'MAPPED',
  FAILED = 'FAILED',
}

export enum EpisodeSyncStatus {
  PENDING = 'PENDING',
  SYNCING = 'SYNCING',
  MAPPED = 'MAPPED',
  AVAILABLE = 'AVAILABLE',
  FAILED = 'FAILED',
}

export interface SyncJobInput {
  jobKey: string;
  type: SyncJobType;
  provider?: string;
  correlationId: string;
  idempotencyKey: string;
  retryOf?: string;
  retryCount?: number;
}

export interface SyncJobRecord {
  id: string;
  jobKey: string;
  type: SyncJobType;
  provider?: string;
  status: SyncJobStatus;
  startedAt?: Date;
  finishedAt?: Date;
  itemsTotal: number;
  itemsProcessed: number;
  itemsFailed: number;
  error?: string;
  correlationId: string;
  idempotencyKey: string;
  retryOf?: string;
  retryCount: number;
}

export interface SyncAnimeMeta {
  providerAnimeId: string;
  title: string;
  synonyms: string[];
  image?: string;
  type: string;
  status: string;
  episodeCount?: number;
  season?: string;
  year?: number;
  genres: string[];
}

export interface SyncEpisode {
  providerEpisodeId: string;
  number: number;
  title?: string;
  isFiller?: boolean;
  airDate?: Date;
}

export interface SyncJobResult {
  success: boolean;
  processed: number;
  failed: number;
  error?: string;
}

export interface LockToken {
  token: string;
  acquiredAt: string;
}