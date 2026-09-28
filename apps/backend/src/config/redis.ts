import Redis from 'ioredis';
import { env } from './env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function connectRedis() {
  await redis.connect();
}

export async function disconnectRedis() {
  await redis.quit();
}

// ---------------------------------------------------------------------------
// Centralized Redis key namespaces / constants
// ---------------------------------------------------------------------------

// Sync scheduler / provider locks (existing, unchanged)
export const LOCK_TTL_SECONDS = 3600;
export const LOCK_RENEWAL_INTERVAL_MS = 60_000;
export const SYNC_SCHEDULER_LOCK_KEY = 'sync:scheduler:lock';
export const SYNC_SCHEDULER_STATE_KEY = 'sync:scheduler:state';
export const SYNC_PROVIDER_LOCK_PREFIX = 'sync:lock:';
export const SYNC_METRICS_PREFIX = 'sync:metrics:';

// --- Redis Streams infrastructure (new) ---

// Stream key constants
export const STREAM = {
  // Discovered releases stream: new DiscoverRelease entries publish here
  discoveredReleases: 'sync:stream:discovered-releases',
  // Sync completion stream: per-provider sync job completions
  syncCompleted: 'sync:stream:completed',
};

// Stream retention: keep only the latest N entries to bound memory growth.
export const STREAM_RETENTION_MAXLEN = 100;

// Consumer group constants
export const CG = {
  // Worker consumer groups — one per process instance
  discoveredReleases: 'sync:stream:workers',
  syncCompleted: 'sync:stream:workers',
};

// Deterministic consumer naming: <prefix>-<pid> ensures each Worker
// instance has a unique name without collisions, while keeping the
// prefix predictable for tooling / observability.
export function consumerName(pid: number): string {
  return `worker-${pid}`;
}

// ---------------------------------------------------------------------------
// Event type definitions (Phase 2 repair)
// ---------------------------------------------------------------------------

// Event types published to Redis Streams.
export enum EventType {
  // A new DiscoveredRelease was persisted to PostgreSQL with
  // lifecycleState = DISCOVERED.
  ReleaseDiscovered = 'release:discovered',
  // A sync job for a provider completed (SUCCESS / FAILURE / PARTIAL).
  SyncCompleted = 'sync:completed',
}

// ---------------------------------------------------------------------------
// Strongly-typed event payloads
// ---------------------------------------------------------------------------

// A "release:discovered" event — published when a new
// DiscoveredRelease row is created/updated in PostgreSQL.
export type ReleaseDiscoveredEvent = {
  event: EventType.ReleaseDiscovered;
  provider: string;
  providerAnimeId: string;
  providerEpisodeId: string;
  episodeNumber?: number;
  episodeTitle?: string;
  airDate?: string | null;
  isFiller?: boolean;
  isRecap?: boolean;
};

// A "sync:completed" event — published when a SyncJob finishes.
export type SyncCompletedEvent = {
  event: EventType.SyncCompleted;
  jobKey: string;
  type: string;
  provider: string;
  status: number; // SyncJobStatus.SUCCESS(1) / FAILURE(2) / PARTIAL(3)
  finishedAt: string; // ISO date string
  correlationId?: string;
};

// ---------------------------------------------------------------------------
// XADD / Stream append helper
// ---------------------------------------------------------------------------

// Appends a new entry to a Redis Stream with bounded retention using MAXLEN.
// Returns the generated entry ID string, or throws if the Redis command fails.
export async function appendEvent(
  stream: keyof typeof STREAM,
  payload: Record<string, unknown>,
): Promise<string> {
  // Build alternating field/value array.
  const fields: (string | number)[] = [];
  for (const [key, value] of Object.entries(payload)) {
    fields.push(key);
    if (value === null || value === undefined) {
      fields.push(0);
    } else if (typeof value === 'boolean') {
      fields.push(value ? 1 : 0);
    } else {
      fields.push(String(value).length > 0 ? String(value) : 0);
    }
  }

  // If payload was empty, ensure at least the event type field exists.
  if (fields.length === 0) {
    fields.push('event', 0);
  }

  const result = await redis.xadd(
    STREAM[stream],
    '*',
    ...fields,
    'MAXLEN',
    STREAM_RETENTION_MAXLEN,
  );

  // ioredis returns the generated ID as a string like "1537-0"
  if (typeof result === 'string') {
    return result;
  }
  return String(result);
}

// ---------------------------------------------------------------------------
// Consumer-group initialization (idempotent)
// ---------------------------------------------------------------------------

export async function initializeConsumerGroup(
  stream: keyof typeof STREAM,
  groupName: string,
): Promise<void> {
  try {
    await redis.xgroup('CREATE', STREAM[stream], groupName, '0', 'MKSTREAM');
  } catch (err: any) {
    // BUSYGROUP means the consumer group already exists — idempotent, return.
    if (err.message && err.message.includes('BUSYGROUP')) {
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// XACK support
// ---------------------------------------------------------------------------

export async function acknowledgeEvent(
  stream: keyof typeof STREAM,
  groupName: string,
  entryId: string,
): Promise<number> {
  if (!entryId || entryId.trim() === '') {
    throw new Error('Entry ID must be a non-empty string to acknowledge');
  }
  return redis.xack(STREAM[stream], groupName, entryId);
}

// ---------------------------------------------------------------------------
// Minimum XREADGROUP read abstraction
// ---------------------------------------------------------------------------

export async function readNewEvents(
  stream: keyof typeof STREAM,
  groupName: string,
  consumerName: string,
  count: number = 1,
): Promise<Array<{ id: string; fields: Record<string, string> }>> {
  const result = await redis.xreadgroup(
    'GROUP',
    groupName,
    consumerName,
    'COUNT',
    String(count),
    'STREAMS',
    STREAM[stream],
    '>',
  );

  if (!result || result.length === 0) {
    return [];
  }

  // ioredis returns: [streamName, [[entryId, [field, val, field, val, ...]]]]
  const entries: any = result[1];
  if (!entries || entries.length === 0) {
    return [];
  }

  return entries.map((entry: any) => {
    const entryId = entry[0];
    const rawFields = entry[1];
    const fields: Record<string, string> = {};
    for (let i = 0; i + 1 < rawFields.length; i += 2) {
      const key = rawFields[i];
      const value = rawFields[i + 1];
      if (typeof key === 'string') {
        fields[key] = typeof value === 'string' ? value : String(value);
      }
    }
    return { id: String(entryId), fields };
  });
}

// ---------------------------------------------------------------------------
// Shutdown / cleanup
// ---------------------------------------------------------------------------

export async function cleanupConsumerGroup(
  stream: keyof typeof STREAM,
  groupName: string,
): Promise<void> {
  try {
    await redis.xgroup('DESTROY', STREAM[stream], groupName);
  } catch (err) {
    // If the group does not exist, that is not an error during shutdown.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('NOGROUP')) {
      console.error(
        `Redis cleanup error while destroying consumer group ${groupName}:`,
        err,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Exported types for the repair's event system
// ---------------------------------------------------------------------------

// SyncJobStatus numeric values — aligned with @prisma/client enum values.
// SyncJobStatus.SUCCESS = 1, FAILURE = 2, PARTIAL = 3
export const enum SyncJobStatusNumber {
  SUCCESS = 1,
  FAILURE = 2,
  PARTIAL = 3,
}

// ---------------------------------------------------------------------------
// End of file
// ---------------------------------------------------------------------------
