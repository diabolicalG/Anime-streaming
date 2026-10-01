import CircuitBreaker from 'opossum';
import type { ProviderSearchResult, ProviderDetail, StreamSource } from './Provider';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  timeout: 25000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 10,
};

export function createCircuitBreaker<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options: CircuitBreakerOptions = {}
) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  const breaker = new CircuitBreaker(fn, opts);
  
  breaker.on('open', () => {
    console.warn(`Circuit breaker OPEN for ${fn.name || 'anonymous function'}`);
  });
  
  breaker.on('close', () => {
    console.log(`Circuit breaker CLOSED for ${fn.name || 'anonymous function'}`);
  });
  
  breaker.on('halfOpen', () => {
    console.log(`Circuit breaker HALF-OPEN for ${fn.name || 'anonymous function'}`);
  });
  
  breaker.on('fallback', (result: unknown) => {
    console.warn(`Circuit breaker FALLBACK triggered for ${fn.name || 'anonymous function'}`, result);
  });
  
  breaker.on('failure', (err: Error) => {
    console.warn(`Circuit breaker FAILURE for ${fn.name || 'anonymous function'}:`, err.message);
  });

  return breaker;
}

export class ProviderCircuitBreakers {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getSearchBreaker(providerName: string) {
    const key = `search:${providerName}`;
    if (!this.breakers.has(key)) {
      this.breakers.set(key, new CircuitBreaker(async <T>(fn: () => Promise<T>) => fn(), DEFAULT_OPTIONS));
    }
    return this.breakers.get(key)!;
  }

  getAnimeInfoBreaker(providerName: string) {
    const key = `animeInfo:${providerName}`;
    if (!this.breakers.has(key)) {
      this.breakers.set(key, new CircuitBreaker(async <T>(fn: () => Promise<T>) => fn(), DEFAULT_OPTIONS));
    }
    return this.breakers.get(key)!;
  }

  getEpisodeSourcesBreaker(providerName: string) {
    const key = `episodeSources:${providerName}`;
    if (!this.breakers.has(key)) {
      this.breakers.set(key, new CircuitBreaker(async <T>(fn: () => Promise<T>) => fn(), DEFAULT_OPTIONS));
    }
    return this.breakers.get(key)!;
  }

  async wrapSearch(providerName: string, fn: () => Promise<ProviderSearchResult[]>): Promise<ProviderSearchResult[]> {
    const breaker = this.getSearchBreaker(providerName);
    return breaker.fire(fn) as Promise<ProviderSearchResult[]>;
  }

  async wrapAnimeInfo(providerName: string, fn: () => Promise<ProviderDetail | null>): Promise<ProviderDetail | null> {
    const breaker = this.getAnimeInfoBreaker(providerName);
    return breaker.fire(fn) as Promise<ProviderDetail | null>;
  }

  async wrapEpisodeSources(providerName: string, fn: () => Promise<StreamSource[]>): Promise<StreamSource[]> {
    const breaker = this.getEpisodeSourcesBreaker(providerName);
    return breaker.fire(fn) as Promise<StreamSource[]>;
  }

  getStatus() {
    const status: Record<string, { status: string; stats: any }> = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = {
        status: String(breaker.status),
        stats: breaker.stats,
      };
    }
    return status;
  }
}

export const providerCircuitBreakers = new ProviderCircuitBreakers();
