import { describe, it, expect } from 'vitest';
import { buildDiscoveryKey, parseDiscoveryKey } from '../src/types/discovery';
import { providerDiscoveryConfigSchema, discoverySchedulerConfigSchema } from '../src/config/discovery';

describe('Discovery Types', () => {
  describe('buildDiscoveryKey', () => {
    it('should build a valid discovery key', () => {
      const key = buildDiscoveryKey('consumet', 'one-piece', 'ep-1');
      expect(key).toBe('consumet:one-piece:ep-1');
    });

    it('should handle special characters in IDs', () => {
      const key = buildDiscoveryKey('anivexa', 'anime-id_123', 'episode-1.5');
      expect(key).toBe('anivexa:anime-id_123:episode-1.5');
    });
  });

  describe('parseDiscoveryKey', () => {
    it('should parse a valid discovery key', () => {
      const parsed = parseDiscoveryKey('consumet:one-piece:ep-1');
      expect(parsed).toEqual({
        provider: 'consumet',
        providerAnimeId: 'one-piece',
        providerEpisodeId: 'ep-1',
      });
    });

    it('should return null for invalid keys', () => {
      expect(parseDiscoveryKey('invalid')).toBeNull();
      expect(parseDiscoveryKey('a:b')).toBeNull();
      expect(parseDiscoveryKey('a:b:c:d')).toBeNull();
    });
  });
});

describe('Discovery Config Schemas', () => {
  describe('providerDiscoveryConfigSchema', () => {
    it('should parse valid config', () => {
      const config = providerDiscoveryConfigSchema.parse({
        provider: 'consumet',
        enabled: true,
        scanIntervalMinutes: 60,
        maxPagesPerScan: 10,
        maxReleasesPerScan: 500,
        batchSize: 50,
        concurrencyLimit: 3,
        retryAttempts: 3,
        retryBaseDelayMs: 1000,
        timeoutMs: 30000,
      });

      expect(config.provider).toBe('consumet');
      expect(config.enabled).toBe(true);
      expect(config.scanIntervalMinutes).toBe(60);
    });

    it('should use defaults for optional fields', () => {
      const config = providerDiscoveryConfigSchema.parse({
        provider: 'consumet',
      });

      expect(config.enabled).toBe(true);
      expect(config.scanIntervalMinutes).toBe(60);
      expect(config.maxPagesPerScan).toBe(10);
      expect(config.maxReleasesPerScan).toBe(500);
      expect(config.batchSize).toBe(50);
      expect(config.concurrencyLimit).toBe(3);
      expect(config.retryAttempts).toBe(3);
      expect(config.retryBaseDelayMs).toBe(1000);
      expect(config.timeoutMs).toBe(30000);
    });

    it('should reject invalid values', () => {
      expect(() => providerDiscoveryConfigSchema.parse({
        provider: 'consumet',
        scanIntervalMinutes: -1,
      })).toThrow();

      expect(() => providerDiscoveryConfigSchema.parse({
        provider: 'consumet',
        concurrencyLimit: 0,
      })).toThrow();
    });
  });

  describe('discoverySchedulerConfigSchema', () => {
    it('should parse valid config', () => {
      const config = discoverySchedulerConfigSchema.parse({
        globalConcurrencyLimit: 5,
        defaultScanIntervalMinutes: 60,
        healthCheckIntervalMinutes: 15,
        jobPruneDays: 30,
        maxRunsPerJob: 50,
        healthchecksIoEnabled: false,
      });

      expect(config.globalConcurrencyLimit).toBe(5);
      expect(config.healthchecksIoEnabled).toBe(false);
    });
  });
});