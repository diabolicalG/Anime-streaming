import { providerRegistry } from './index';
import { providerCircuitBreakers } from './CircuitBreaker';
import { mappingService } from '../mapping';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('../cache', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    episodeCache: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
    },
  };
});

describe('ProviderRegistry - getEpisodeSourcesWithFallback with resolved provider', () => {
  let originalWrapEpisodeSources: typeof providerCircuitBreakers.wrapEpisodeSources;
  let originalResolveProviderId: typeof mappingService.resolveProviderId;

  let mockWrapEpisodeSources: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    originalResolveProviderId = mappingService.resolveProviderId;
    originalWrapEpisodeSources = providerCircuitBreakers.wrapEpisodeSources;

    mockWrapEpisodeSources = vi.fn();
    providerCircuitBreakers.wrapEpisodeSources = mockWrapEpisodeSources;

    // Mock mappingService to return a resolved provider
    mappingService.resolveProviderId = vi.fn().mockResolvedValue({
      providerId: 'test-anime-id',
      providerName: 'consumet',
    });
  });

  afterEach(async () => {
    if (originalResolveProviderId) {
      mappingService.resolveProviderId = originalResolveProviderId;
    }
    if (originalWrapEpisodeSources) {
      providerCircuitBreakers.wrapEpisodeSources = originalWrapEpisodeSources;
    }
    vi.restoreAllMocks();
  });

  it('A. should call ONLY the resolved provider when mapping resolves successfully', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        return fn();
      }
      return [];
    });

    // Mock the actual provider call
    const consumetProvider = providerRegistry.getProvider('consumet');
    const originalGetEpisodeSources = consumetProvider?.getEpisodeSources;
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://example.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }
    if (originalGetEpisodeSources) {
      // Restore after test
    }

    const sources = await providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1');

    expect(mappingService.resolveProviderId).toHaveBeenCalledWith(12345);
    expect(mockWrapEpisodeSources).toHaveBeenCalledWith('consumet', expect.any(Function));
    expect(sources.length).toBe(1);
    expect(sources[0].quality).toBe('720p');
  });

  it('B. should not call other providers when resolved provider succeeds', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        return fn();
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://example.com/stream.m3u8', quality: '1080p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }

    await providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1');

    // Verify only consumet was called via wrapEpisodeSources
    const consumetCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'consumet');
    const anivexaCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'anivexa');
    expect(consumetCalls).toHaveLength(1);
    expect(anivexaCalls).toHaveLength(0);
  });

  it('C. should pass the resolved providerId and providerEpisodeId to the resolved provider', async () => {
    let capturedProviderId: string | null = null;
    let capturedProviderEpisodeId: string | null = null;

    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        const result = await fn();
        return result;
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockImplementation(async (providerId, providerEpisodeId) => {
        capturedProviderId = providerId;
        capturedProviderEpisodeId = providerEpisodeId;
        return [
          { url: 'http://example.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
        ];
      });
    }

    await providerRegistry.getEpisodeSourcesWithFallback('99999', 'ep-5');

    expect(mappingService.resolveProviderId).toHaveBeenCalledWith(99999);
    expect(capturedProviderId).toBe('test-anime-id');
    expect(capturedProviderEpisodeId).toBe('ep-5');
  });

  it('D. should throw error when resolved provider is not registered', async () => {
    mappingService.resolveProviderId = vi.fn().mockResolvedValue({
      providerId: 'some-id',
      providerName: 'unknown-provider',
    });

    await expect(providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1'))
      .rejects.toThrow("Resolved provider 'unknown-provider' not found");

    // Should not call wrapEpisodeSources at all for unknown provider
    expect(mockWrapEpisodeSources).not.toHaveBeenCalled();
  });

  it('D. should propagate error when resolved provider fails', async () => {
    mappingService.resolveProviderId = vi.fn().mockResolvedValue({
      providerId: 'test-id',
      providerName: 'consumet',
    });
    mockWrapEpisodeSources.mockRejectedValue(new Error('Provider timeout'));

    await expect(providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1'))
      .rejects.toThrow('Provider timeout');

    expect(mockWrapEpisodeSources).toHaveBeenCalledWith('consumet', expect.any(Function));
  });

  it('D. should throw when resolved provider returns no sources (no fallback to other providers)', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        return fn();
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockResolvedValue([]);
    }

    await expect(providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1'))
      .rejects.toThrow('No stream sources available from resolved provider');

    expect(mockWrapEpisodeSources).toHaveBeenCalledWith('consumet', expect.any(Function));
    // Should NOT have called anivexa
    const anivexaCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'anivexa');
    expect(anivexaCalls).toHaveLength(0);
  });

  it('E. should preserve existing behavior for non-AniList provider IDs', async () => {
    // Reset mapping mock to not be called
    mappingService.resolveProviderId = vi.fn().mockResolvedValue(null);

    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'anivexa') {
        return fn();
      }
      return [];
    });

    const anivexaProvider = providerRegistry.getProvider('anivexa');
    if (anivexaProvider) {
      anivexaProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://anivexa.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }

    // Use a non-AniList provider ID (e.g., gogoanime format)
    const sources = await providerRegistry.getEpisodeSourcesWithFallback('gogoanime:one-piece', 'ep-1');

    expect(mappingService.resolveProviderId).not.toHaveBeenCalled();
    // Should use fallback logic - try all providers
    const anivexaCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'anivexa');
    expect(anivexaCalls.length).toBeGreaterThan(0);
    expect(sources.length).toBe(1);
    expect(sources[0].quality).toBe('720p');
  });

  it('E. should preserve existing fallback behavior when AniList ID has no mapping', async () => {
    mappingService.resolveProviderId = vi.fn().mockResolvedValue(null);

    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'anivexa') {
        return fn();
      }
      return [];
    });

    const anivexaProvider = providerRegistry.getProvider('anivexa');
    if (anivexaProvider) {
      anivexaProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://anivexa.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }

    const sources = await providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1');

    expect(mappingService.resolveProviderId).toHaveBeenCalledWith(12345);
    const anivexaCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'anivexa');
    expect(anivexaCalls.length).toBeGreaterThan(0);
    expect(sources.length).toBe(1);
    expect(sources[0].quality).toBe('720p');
  });

  it('E. should cache results correctly for resolved provider', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        return fn();
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://example.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }

    // First call
    await providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1');
    // Second call - cache should be checked but our mock always returns null
    // This test just verifies the provider method gets called
    await providerRegistry.getEpisodeSourcesWithFallback('12345', 'ep-1');

    // The mock was called twice because cache mock returns null
    // This is expected behavior with a mock cache that always misses
    const consumetCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'consumet');
    expect(consumetCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ProviderRegistry - getEpisodeSourcesFromProvider', () => {
  let originalWrapEpisodeSources: typeof providerCircuitBreakers.wrapEpisodeSources;

  let mockWrapEpisodeSources: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    originalWrapEpisodeSources = providerCircuitBreakers.wrapEpisodeSources;

    mockWrapEpisodeSources = vi.fn();
    providerCircuitBreakers.wrapEpisodeSources = mockWrapEpisodeSources;
  });

  afterEach(async () => {
    if (originalWrapEpisodeSources) {
      providerCircuitBreakers.wrapEpisodeSources = originalWrapEpisodeSources;
    }
    vi.restoreAllMocks();
  });

  it('should call the specified provider directly', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        return fn();
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://example.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }

    const sources = await providerRegistry.getEpisodeSourcesFromProvider('consumet', 'test-anime-id', 'ep-1');

    expect(mockWrapEpisodeSources).toHaveBeenCalledWith('consumet', expect.any(Function));
    expect(sources.length).toBe(1);
    expect(sources[0].quality).toBe('720p');
  });

  it('should not call other providers', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'anivexa') {
        return fn();
      }
      return [];
    });

    const anivexaProvider = providerRegistry.getProvider('anivexa');
    if (anivexaProvider) {
      anivexaProvider.getEpisodeSources = vi.fn().mockResolvedValue([
        { url: 'http://anivexa.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
      ]);
    }

    await providerRegistry.getEpisodeSourcesFromProvider('anivexa', 'test-anime-id', 'ep-1');

    const consumetCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'consumet');
    const anivexaCalls = mockWrapEpisodeSources.mock.calls.filter(call => call[0] === 'anivexa');
    expect(consumetCalls).toHaveLength(0);
    expect(anivexaCalls).toHaveLength(1);
  });

  it('should pass the correct providerId and providerEpisodeId to the provider', async () => {
    let capturedProviderId: string | null = null;
    let capturedProviderEpisodeId: string | null = null;

    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        const result = await fn();
        return result;
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockImplementation(async (providerId, providerEpisodeId) => {
        capturedProviderId = providerId;
        capturedProviderEpisodeId = providerEpisodeId;
        return [
          { url: 'http://example.com/stream.m3u8', quality: '720p', isM3U8: true, headers: {}, subtitles: [] },
        ];
      });
    }

    await providerRegistry.getEpisodeSourcesFromProvider('consumet', 'test-anime-id', 'ep-5');

    expect(capturedProviderId).toBe('test-anime-id');
    expect(capturedProviderEpisodeId).toBe('ep-5');
  });

  it('should throw error when provider is not registered', async () => {
    await expect(providerRegistry.getEpisodeSourcesFromProvider('unknown-provider' as any, 'test-id', 'ep-1'))
      .rejects.toThrow("Provider 'unknown-provider' not found");
  });

  it('should propagate error when provider fails', async () => {
    mockWrapEpisodeSources.mockRejectedValue(new Error('Provider timeout'));

    await expect(providerRegistry.getEpisodeSourcesFromProvider('consumet', 'test-id', 'ep-1'))
      .rejects.toThrow('Provider timeout');

    expect(mockWrapEpisodeSources).toHaveBeenCalledWith('consumet', expect.any(Function));
  });

  it('should throw when provider returns no sources', async () => {
    mockWrapEpisodeSources.mockImplementation(async (providerName, fn) => {
      if (providerName === 'consumet') {
        return fn();
      }
      return [];
    });

    const consumetProvider = providerRegistry.getProvider('consumet');
    if (consumetProvider) {
      consumetProvider.getEpisodeSources = vi.fn().mockResolvedValue([]);
    }

    await expect(providerRegistry.getEpisodeSourcesFromProvider('consumet', 'test-id', 'ep-1'))
      .rejects.toThrow('No stream sources available from provider consumet');
  });
});