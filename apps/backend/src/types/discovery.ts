import type { ReleaseLifecycleState, ScanJobStatus } from '@prisma/client';

export interface DiscoveredReleaseInput {
  provider: string;
  providerAnimeId: string;
  providerEpisodeId: string;
  episodeNumber: number;
  episodeTitle?: string;
  airDate?: Date | string;
  isFiller?: boolean;
  isRecap?: boolean;
  rawData?: Record<string, unknown>;
}

export interface DiscoveredRelease extends DiscoveredReleaseInput {
  id: string;
  lifecycleState: ReleaseLifecycleState;
  firstSeenAt: Date;
  lastSeenAt: Date;
  scanJobId?: string;
}

export type DiscoveredReleaseUpsertResult = 
  | { action: 'INSERT'; release: DiscoveredRelease }
  | { action: 'UPDATE'; release: DiscoveredRelease; changed: boolean }
  | { action: 'SKIP'; release: DiscoveredRelease; reason: string };

export interface ScanJobInput {
  jobKey: string;
  provider?: string;
  correlationId: string;
}

export interface ScanJobRecord {
  id: string;
  jobKey: string;
  provider?: string;
  status: ScanJobStatus;
  startedAt: Date;
  finishedAt?: Date;
  releasesFound: number;
  releasesNew: number;
  releasesUpdated: number;
  error?: string;
  correlationId: string;
}

export interface ProviderDiscoveryConfig {
  provider: string;
  enabled: boolean;
  scanIntervalMinutes: number;
  maxPagesPerScan: number;
  maxReleasesPerScan: number;
  batchSize: number;
  concurrencyLimit: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  timeoutMs: number;
}

export interface DiscoverySchedulerConfig {
  globalConcurrencyLimit: number;
  defaultScanIntervalMinutes: number;
  healthCheckIntervalMinutes: number;
  jobPruneDays: number;
  maxRunsPerJob: number;
  healthchecksIoEnabled: boolean;
}

export interface DiscoveryAdapterCallOptions {
  signal?: AbortSignal;
  page?: number;
  limit?: number;
}

export interface DiscoveryAdapter {
  readonly providerId: string;
  readonly providerName: string;
  readonly config: ProviderDiscoveryConfig;
  
  discover(options?: DiscoveryAdapterCallOptions): Promise<DiscoveredReleaseInput[]>;
  healthCheck(): Promise<boolean>;
  getRateLimitInfo(): { remaining: number; resetAt: Date } | null;
}

export interface DiscoveryOrchestrator {
  scanAllProviders(correlationId?: string): Promise<ScanJobRecord[]>;
  scanProvider(providerId: string, correlationId?: string): Promise<ScanJobRecord>;
  getScanHistory(providerId?: string, limit?: number): Promise<ScanJobRecord[]>;
  getProviderHealth(providerId: string): Promise<ProviderHealthStatus>;
}

export interface ProviderHealthStatus {
  providerId: string;
  healthy: boolean;
  lastCheck: Date;
  lastSuccess?: Date;
  consecutiveFailures: number;
  circuitOpen: boolean;
  nextRetryAt?: Date;
  errorRate: number;
}

export interface UpsertResultSummary {
  totalProcessed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export const DISCOVERY_REDIS_PREFIX = 'discovery:';
export const PROVIDER_LOCK_PREFIX = 'discovery:lock:';
export const SCAN_JOB_PREFIX = 'discovery:job:';

export function buildDiscoveryKey(provider: string, providerAnimeId: string, providerEpisodeId: string): string {
  return `${provider}:${providerAnimeId}:${providerEpisodeId}`;
}

export function parseDiscoveryKey(key: string): { provider: string; providerAnimeId: string; providerEpisodeId: string } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  return { provider: parts[0], providerAnimeId: parts[1], providerEpisodeId: parts[2] };
}