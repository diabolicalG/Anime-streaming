import axios, { AxiosInstance, AxiosError } from 'axios';
import { ProviderDiscoveryConfig, DiscoveryAdapter, DiscoveredReleaseInput } from '../../../types/discovery';

export interface DiscoveryAdapterCallOptions {
  signal?: AbortSignal;
  page?: number;
  limit?: number;
}

export abstract class BaseDiscoveryAdapter implements DiscoveryAdapter {
  abstract readonly providerId: string;
  abstract readonly providerName: string;
  readonly config: ProviderDiscoveryConfig;

  protected client: AxiosInstance;
  private semaphore?: Semaphore;
  protected lastRateLimitInfo: { remaining: number; resetAt: Date } | null = null;

  constructor(config: ProviderDiscoveryConfig, baseUrl: string) {
    this.config = config;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: config.timeoutMs,
      headers: { 'User-Agent': 'anime-streaming-discovery/1.0' },
    });
    
    this.client.interceptors.response.use(
      (response) => {
        this.updateRateLimitInfo(response.headers);
        return response;
      },
      (error: AxiosError) => {
        if (error.response?.headers) {
          this.updateRateLimitInfo(error.response.headers);
        }
        throw error;
      }
    );
  }

  private updateRateLimitInfo(headers: Record<string, unknown>): void {
    const remaining = headers['x-ratelimit-remaining'] || headers['ratelimit-remaining'];
    const reset = headers['x-ratelimit-reset'] || headers['ratelimit-reset'];
    
    if (remaining !== undefined && reset !== undefined) {
      this.lastRateLimitInfo = {
        remaining: parseInt(String(remaining), 10),
        resetAt: new Date(parseInt(String(reset), 10) * 1000),
      };
    }
  }

  getRateLimitInfo(): { remaining: number; resetAt: Date } | null {
    return this.lastRateLimitInfo;
  }

  protected withConcurrency<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.config.concurrencyLimit || this.config.concurrencyLimit <= 0) {
      return fn();
    }
    if (!this.semaphore) {
      this.semaphore = new Semaphore(this.config.concurrencyLimit);
    }
    return this.semaphore.run(fn);
  }

  protected async withRetry<T>(
    fn: () => Promise<T>,
    options: { attempts?: number; baseDelayMs?: number; signal?: AbortSignal } = {}
  ): Promise<T> {
    const { attempts = this.config.retryAttempts, baseDelayMs = this.config.retryBaseDelayMs, signal } = options;
    let lastError: Error;

    for (let attempt = 0; attempt <= attempts; attempt++) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === attempts) break;

        const isRetryable = this.isRetryableError(error);
        if (!isRetryable) throw lastError;

        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        await this.sleep(delay, signal);
      }
    }

    throw lastError!;
  }

  protected isRetryableError(error: unknown): boolean {
    if (error instanceof AxiosError) {
      if (!error.response) return true;
      const status = error.response.status;
      return status === 429 || status >= 500;
    }
    return false;
  }

  protected sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
    });
  }

  abstract discover(options?: DiscoveryAdapterCallOptions): Promise<DiscoveredReleaseInput[]>;

  async healthCheck(): Promise<boolean> {
    try {
      await this.performHealthCheck();
      return true;
    } catch {
      return false;
    }
  }

  protected abstract performHealthCheck(): Promise<void>;
}

class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(max: number) {
    this.permits = max;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.permits += 1;
  }
}