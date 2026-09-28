import { z } from 'zod';
import { env } from './env';

export const providerDiscoveryConfigSchema = z.object({
  provider: z.string(),
  enabled: z.boolean().default(true),
  scanIntervalMinutes: z.coerce.number().int().positive().default(60),
  maxPagesPerScan: z.coerce.number().int().positive().default(10),
  maxReleasesPerScan: z.coerce.number().int().positive().default(500),
  batchSize: z.coerce.number().int().positive().default(50),
  concurrencyLimit: z.coerce.number().int().positive().default(3),
  retryAttempts: z.coerce.number().int().nonnegative().default(3),
  retryBaseDelayMs: z.coerce.number().int().positive().default(1000),
  timeoutMs: z.coerce.number().int().positive().default(30000),
  baseUrl: z.string().url().optional(),
});

export const discoverySchedulerConfigSchema = z.object({
  globalConcurrencyLimit: z.coerce.number().int().positive().default(5),
  defaultScanIntervalMinutes: z.coerce.number().int().positive().default(60),
  healthCheckIntervalMinutes: z.coerce.number().int().positive().default(15),
  jobPruneDays: z.coerce.number().int().positive().default(30),
  maxRunsPerJob: z.coerce.number().int().positive().default(50),
  healthchecksIoEnabled: z.coerce.boolean().default(false),
});

export const discoveryConfigSchema = z.object({
  consumet: providerDiscoveryConfigSchema.extend({
    provider: z.literal('consumet'),
  }),
  anivexa: providerDiscoveryConfigSchema.extend({
    provider: z.literal('anivexa'),
  }),
  anikoto: providerDiscoveryConfigSchema.extend({
    provider: z.literal('anikoto'),
  }),
  scheduler: discoverySchedulerConfigSchema,
});

export type ProviderDiscoveryConfig = z.infer<typeof providerDiscoveryConfigSchema>;
export type DiscoverySchedulerConfig = z.infer<typeof discoverySchedulerConfigSchema>;
export type DiscoveryConfig = z.infer<typeof discoveryConfigSchema>;

interface ProviderConfigMap {
  consumet: ProviderDiscoveryConfig & { provider: 'consumet'; baseUrl: string };
  anivexa: ProviderDiscoveryConfig & { provider: 'anivexa'; baseUrl: string };
}

function getEnvConfig(): DiscoveryConfig {
  const consumetConfig = providerDiscoveryConfigSchema.parse({
    provider: 'consumet',
    enabled: env.NODE_ENV !== 'test',
    scanIntervalMinutes: parseInt(process.env.CONSUMET_SCAN_INTERVAL_MINUTES || '60', 10),
    maxPagesPerScan: parseInt(process.env.CONSUMET_MAX_PAGES_PER_SCAN || '10', 10),
    maxReleasesPerScan: parseInt(process.env.CONSUMET_MAX_RELEASES_PER_SCAN || '500', 10),
    batchSize: parseInt(process.env.CONSUMET_BATCH_SIZE || '50', 10),
    concurrencyLimit: parseInt(process.env.CONSUMET_CONCURRENCY_LIMIT || '3', 10),
    retryAttempts: parseInt(process.env.CONSUMET_RETRY_ATTEMPTS || '3', 10),
    retryBaseDelayMs: parseInt(process.env.CONSUMET_RETRY_BASE_DELAY_MS || '1000', 10),
    timeoutMs: parseInt(process.env.CONSUMET_TIMEOUT_MS || '30000', 10),
    baseUrl: env.CONSUMET_BASE_URL,
  });

const anivexaConfig = providerDiscoveryConfigSchema.parse({
    provider: 'anivexa',
    enabled: env.NODE_ENV !== 'test',
    scanIntervalMinutes: parseInt(process.env.ANIVEXA_SCAN_INTERVAL_MINUTES || '60', 10),
    maxPagesPerScan: parseInt(process.env.ANIVEXA_MAX_PAGES_PER_SCAN || '10', 10),
    maxReleasesPerScan: parseInt(process.env.ANIVEXA_MAX_RELEASES_PER_SCAN || '500', 10),
    batchSize: parseInt(process.env.ANIVEXA_BATCH_SIZE || '50', 10),
    concurrencyLimit: parseInt(process.env.ANIVEXA_CONCURRENCY_LIMIT || '3', 10),
    retryAttempts: parseInt(process.env.ANIVEXA_RETRY_ATTEMPTS || '3', 10),
    retryBaseDelayMs: parseInt(process.env.ANIVEXA_RETRY_BASE_DELAY_MS || '1000', 10),
    timeoutMs: parseInt(process.env.ANIVEXA_TIMEOUT_MS || '30000', 10),
    baseUrl: env.ANIVEXA_BASE_URL,
  });

const anikotoConfig = providerDiscoveryConfigSchema.parse({
    provider: 'anikoto',
    enabled: env.NODE_ENV !== 'test',
    scanIntervalMinutes: parseInt(process.env.ANIKOTO_SCAN_INTERVAL_MINUTES || '60', 10),
    maxPagesPerScan: parseInt(process.env.ANIKOTO_MAX_PAGES_PER_SCAN || '10', 10),
    maxReleasesPerScan: parseInt(process.env.ANIKOTO_MAX_RELEASES_PER_SCAN || '500', 10),
    batchSize: parseInt(process.env.ANIKOTO_BATCH_SIZE || '50', 10),
    concurrencyLimit: parseInt(process.env.ANIKOTO_CONCURRENCY_LIMIT || '3', 10),
    retryAttempts: parseInt(process.env.ANIKOTO_RETRY_ATTEMPTS || '3', 10),
    retryBaseDelayMs: parseInt(process.env.ANIKOTO_RETRY_BASE_DELAY_MS || '1000', 10),
    timeoutMs: parseInt(process.env.ANIKOTO_TIMEOUT_MS || '30000', 10),
    baseUrl: env.ANIKOTO_BASE_URL,
  });

  const schedulerConfig = discoverySchedulerConfigSchema.parse({
    globalConcurrencyLimit: parseInt(process.env.DISCOVERY_GLOBAL_CONCURRENCY || '5', 10),
    defaultScanIntervalMinutes: parseInt(process.env.DISCOVERY_DEFAULT_SCAN_INTERVAL_MINUTES || '60', 10),
    healthCheckIntervalMinutes: parseInt(process.env.DISCOVERY_HEALTH_CHECK_INTERVAL_MINUTES || '15', 10),
    jobPruneDays: parseInt(process.env.DISCOVERY_JOB_PRUNE_DAYS || '30', 10),
    maxRunsPerJob: parseInt(process.env.DISCOVERY_MAX_RUNS_PER_JOB || '50', 10),
    healthchecksIoEnabled: process.env.HEALTHCHECKS_IO_ENABLED === 'true',
  });

  return {
    consumet: consumetConfig,
    anivexa: anivexaConfig,
    scheduler: schedulerConfig,
  } as DiscoveryConfig;
}

export const discoveryConfig = getEnvConfig();

export function getProviderConfig(provider: 'consumet' | 'anivexa' | 'anikoto'): ProviderDiscoveryConfig {
  return discoveryConfig[provider];
}

export function getSchedulerConfig(): DiscoverySchedulerConfig {
  return discoveryConfig.scheduler;
}