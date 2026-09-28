import { z } from 'zod';
import { env } from '@/config/env';

export const syncSchedulerConfigSchema = z.object({
  fullCatalogIntervalHours: z.coerce.number().int().positive().default(24),
  incrementalIntervalMinutes: z.coerce.number().int().positive().default(30),
  maxConcurrentProviders: z.coerce.number().int().positive().default(2),
  jobTimeoutMinutes: z.coerce.number().int().positive().default(120),
  maxRetries: z.coerce.number().int().positive().default(3),
  lockTtlSeconds: z.coerce.number().int().positive().default(3600),
  lockRenewalIntervalSeconds: z.coerce.number().int().positive().default(60),
});

export type SyncSchedulerConfig = z.infer<typeof syncSchedulerConfigSchema>;

export function getSyncConfig(): {
  fullCatalogIntervalHours: number;
  incrementalIntervalMinutes: number;
  maxConcurrentProviders: number;
  jobTimeoutMinutes: number;
  maxRetries: number;
  lockTtlSeconds: number;
  lockRenewalIntervalSeconds: number;
} {
  return {
    fullCatalogIntervalHours: parseInt(process.env.SYNC_FULL_CATALOG_INTERVAL_HOURS || '24', 10),
    incrementalIntervalMinutes: parseInt(process.env.SYNC_INCREMENTAL_INTERVAL_MINUTES || '30', 10),
    maxConcurrentProviders: parseInt(process.env.SYNC_MAX_CONCURRENT_PROVIDERS || '2', 10),
    jobTimeoutMinutes: parseInt(process.env.SYNC_JOB_TIMEOUT_MINUTES || '120', 10),
    maxRetries: parseInt(process.env.SYNC_MAX_RETRIES || '3', 10),
    lockTtlSeconds: parseInt(process.env.SYNC_LOCK_TTL_SECONDS || '3600', 10),
    lockRenewalIntervalSeconds: parseInt(process.env.SYNC_LOCK_RENEWAL_INTERVAL_SECONDS || '60', 10),
  };
}