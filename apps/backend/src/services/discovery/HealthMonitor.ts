import { redis } from '../../config/redis';

const HEALTH_PREFIX = 'discovery:health:';
const CIRCUIT_PREFIX = 'discovery:circuit:';
const METRICS_PREFIX = 'discovery:metrics:';

export interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  nextAttempt?: Date;
}

export interface ProviderMetrics {
  providerId: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  avgResponseTimeMs: number;
  lastRequestAt?: Date;
  errorRate: number;
  circuitBreaker: CircuitBreakerState;
}

export interface HealthMonitorConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxRequests: number;
  metricsWindowMs: number;
}

const DEFAULT_CONFIG: HealthMonitorConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 60000,
  halfOpenMaxRequests: 3,
  metricsWindowMs: 5 * 60 * 1000,
};

export class HealthMonitor {
  private config: HealthMonitorConfig;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async recordSuccess(providerId: string, responseTimeMs: number): Promise<void> {
    const metricsKey = `${METRICS_PREFIX}${providerId}`;
    const circuitKey = `${CIRCUIT_PREFIX}${providerId}`;
    const healthKey = `${HEALTH_PREFIX}${providerId}`;

    const circuit = await this.getCircuitBreaker(providerId);
    const now = new Date();

    if (circuit.state === 'HALF_OPEN') {
      circuit.successes++;
      if (circuit.successes >= this.config.successThreshold) {
        circuit.state = 'CLOSED';
        circuit.failures = 0;
        circuit.successes = 0;
        console.log(`[HealthMonitor] Circuit CLOSED for ${providerId}`);
      }
    } else if (circuit.state === 'CLOSED') {
      circuit.failures = 0;
    }

    circuit.lastSuccess = now;
    await this.saveCircuitBreaker(providerId, circuit);

    const metrics = await this.getMetrics(providerId);
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.consecutiveFailures = 0;
    metrics.consecutiveSuccesses++;
    metrics.avgResponseTimeMs = 
      (metrics.avgResponseTimeMs * (metrics.totalRequests - 1) + responseTimeMs) / metrics.totalRequests;
    metrics.lastRequestAt = now;
    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;
    metrics.circuitBreaker = circuit;

    await this.saveMetrics(providerId, metrics);
    await this.updateHealthStatus(providerId, metrics);
  }

  async recordFailure(providerId: string, error: Error): Promise<void> {
    const circuitKey = `${CIRCUIT_PREFIX}${providerId}`;
    const circuit = await this.getCircuitBreaker(providerId);
    const now = new Date();

    circuit.failures++;
    circuit.lastFailure = now;

    if (circuit.state === 'HALF_OPEN') {
      circuit.state = 'OPEN';
      circuit.nextAttempt = new Date(now.getTime() + this.config.timeoutMs);
      console.warn(`[HealthMonitor] Circuit OPENED (half-open failure) for ${providerId}`);
    } else if (circuit.state === 'CLOSED' && circuit.failures >= this.config.failureThreshold) {
      circuit.state = 'OPEN';
      circuit.nextAttempt = new Date(now.getTime() + this.config.timeoutMs);
      console.warn(`[HealthMonitor] Circuit OPENED for ${providerId} after ${circuit.failures} failures`);
    }

    await this.saveCircuitBreaker(providerId, circuit);

    const metrics = await this.getMetrics(providerId);
    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.consecutiveFailures++;
    metrics.consecutiveSuccesses = 0;
    metrics.lastRequestAt = now;
    metrics.errorRate = metrics.failedRequests / metrics.totalRequests;
    metrics.circuitBreaker = circuit;

    await this.saveMetrics(providerId, metrics);
    await this.updateHealthStatus(providerId, metrics);
  }

  async canExecute(providerId: string): Promise<boolean> {
    const circuit = await this.getCircuitBreaker(providerId);
    const now = new Date();

    if (circuit.state === 'CLOSED') return true;

    if (circuit.state === 'OPEN') {
      if (circuit.nextAttempt && now >= circuit.nextAttempt) {
        circuit.state = 'HALF_OPEN';
        circuit.successes = 0;
        await this.saveCircuitBreaker(providerId, circuit);
        console.log(`[HealthMonitor] Circuit HALF_OPEN for ${providerId}`);
        return true;
      }
      return false;
    }

    if (circuit.state === 'HALF_OPEN') {
      return true;
    }

    return false;
  }

  async getHealth(providerId: string): Promise<ProviderMetrics> {
    const metrics = await this.getMetrics(providerId);
    const circuit = await this.getCircuitBreaker(providerId);
    metrics.circuitBreaker = circuit;
    return metrics;
  }

  async getAllHealth(): Promise<ProviderMetrics[]> {
    const keys = await redis.keys(`${METRICS_PREFIX}*`);
    const results: ProviderMetrics[] = [];

    for (const key of keys) {
      const providerId = key.replace(METRICS_PREFIX, '');
      const metrics = await this.getHealth(providerId);
      results.push(metrics);
    }

    return results;
  }

  async resetCircuit(providerId: string): Promise<void> {
    const circuit: CircuitBreakerState = {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
    };
    await this.saveCircuitBreaker(providerId, circuit);
    console.log(`[HealthMonitor] Circuit manually reset for ${providerId}`);
  }

  async pauseProvider(providerId: string, durationMs: number): Promise<void> {
    const circuit = await this.getCircuitBreaker(providerId);
    const now = new Date();
    circuit.state = 'OPEN';
    circuit.nextAttempt = new Date(now.getTime() + durationMs);
    await this.saveCircuitBreaker(providerId, circuit);
    console.log(`[HealthMonitor] Provider ${providerId} paused for ${durationMs}ms`);
  }

  private async getCircuitBreaker(providerId: string): Promise<CircuitBreakerState> {
    const data = await redis.get(`${CIRCUIT_PREFIX}${providerId}`);
    if (!data) {
      return { state: 'CLOSED', failures: 0, successes: 0 };
    }
    return JSON.parse(data);
  }

  private async saveCircuitBreaker(providerId: string, circuit: CircuitBreakerState): Promise<void> {
    await redis.set(`${CIRCUIT_PREFIX}${providerId}`, JSON.stringify(circuit));
  }

  private async getMetrics(providerId: string): Promise<ProviderMetrics> {
    const data = await redis.get(`${METRICS_PREFIX}${providerId}`);
    if (!data) {
      return {
        providerId,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveFailures: 0,
        consecutiveSuccesses: 0,
        avgResponseTimeMs: 0,
        errorRate: 0,
        circuitBreaker: { state: 'CLOSED', failures: 0, successes: 0 },
      };
    }
    return JSON.parse(data);
  }

  private async saveMetrics(providerId: string, metrics: ProviderMetrics): Promise<void> {
    await redis.set(`${METRICS_PREFIX}${providerId}`, JSON.stringify(metrics));
  }

  private async updateHealthStatus(providerId: string, metrics: ProviderMetrics): Promise<void> {
    const healthKey = `${HEALTH_PREFIX}${providerId}`;
    const health = {
      providerId,
      healthy: metrics.circuitBreaker.state !== 'OPEN',
      lastCheck: new Date(),
      lastSuccess: metrics.circuitBreaker.lastSuccess,
      consecutiveFailures: metrics.consecutiveFailures,
      circuitOpen: metrics.circuitBreaker.state === 'OPEN',
      nextRetryAt: metrics.circuitBreaker.nextAttempt,
      errorRate: metrics.errorRate,
    };
    await redis.setex(healthKey, 300, JSON.stringify(health));
  }
}

export const healthMonitor = new HealthMonitor();

export async function wrapWithHealthMonitor<T>(
  providerId: string,
  fn: () => Promise<T>
): Promise<T> {
  const canExecute = await healthMonitor.canExecute(providerId);
  if (!canExecute) {
    throw new Error(`Circuit breaker OPEN for provider ${providerId}`);
  }

  const startTime = Date.now();
  try {
    const result = await fn();
    await healthMonitor.recordSuccess(providerId, Date.now() - startTime);
    return result;
  } catch (error) {
    await healthMonitor.recordFailure(providerId, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}