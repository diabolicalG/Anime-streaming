# Phase 2 Synchronization Architecture - Implementation-Ready Plan

**Status:** APPROVED - Implementation Baseline  
**Date:** 2025-09-15  
**Repository:** `/root/anime-streaming`  
**Plan Location:** `/root/anime-streaming/.opencode/plans/phase2-synchronization-plan.md`

---

## Executive Summary

This document freezes the **Phase 2 Synchronization Architecture** as the implementation baseline. The design integrates Phase 1 Discovery (read-only) and Phase 3 Streaming/Mapping (frozen) to build a provider-agnostic synchronization layer that:

- **Consumes** Phase 1 `DiscoveredRelease` as read-only input
- **Uses** Phase 3 `mappingService.resolveProviderId()` for AniList→Provider identity resolution
- **Uses** Phase 3 `ProviderRegistry.getEpisodeSourcesWithFallback()` for stream availability
- **Produces** `Anime` and `Episode` records with provider-scoped identities
- **Owns** `SyncJob` lifecycle with atomic retry/idempotency semantics

**No modifications** to Phase 1 (Discovery) or Phase 3 (Streaming/Mapping) contracts.

---

## 1. SyncJob Schema, Enums, Indexes & Migration

### 1.1 Prisma Schema Additions (`prisma/schema.prisma`)

```prisma
// NEW ENUMS
enum SyncJobType {
  FULL_CATALOG
  INCREMENTAL_EPISODES
  BACKFILL
  REPAIR
}

enum SyncJobStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILURE
  PARTIAL
}

enum AnimeSyncStatus {
  PENDING
  SYNCING
  MAPPED
  FAILED
}

enum EpisodeSyncStatus {
  PENDING
  SYNCING
  MAPPED
  AVAILABLE
  FAILED
}

// NEW MODELS
model Anime {
  id                Int       @id @default(autoincrement())
  anilistId         Int       @unique
  title             String
  synonyms          String[]
  image             String?
  description       String?
  type              String
  status            String
  episodeCount      Int?
  season            String?
  seasonYear        Int?
  genres            String[]
  providerMappings  Json      // { "consumet": "one-piece", "anivexa": "one-piece" }
  syncStatus        AnimeSyncStatus @default(PENDING)
  lastSyncedAt      DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  episodes          Episode[]

  @@index([syncStatus])
  @@index([anilistId])
}

model Episode {
  id                   String    @id @default(cuid())
  animeId              Int
  anime                Anime     @relation(fields: [animeId], references: [id], onDelete: Cascade)
  number               Int
  title                String?
  isFiller             Boolean   @default(false)
  isRecap              Boolean   @default(false)
  airDate              DateTime?
  providerEpisodeIds   Json      // { "consumet": "ep-123", "anivexa": "ep-456" }
  syncStatus           EpisodeSyncStatus @default(PENDING)
  lastSyncedAt         DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@unique([animeId, number])
  @@index([animeId, syncStatus])
}

model SyncJob {
  id                String        @id @default(cuid())
  jobKey            String
  type              SyncJobType
  provider          String?
  status            SyncJobStatus @default(PENDING)
  startedAt         DateTime?
  finishedAt        DateTime?
  itemsTotal        Int           @default(0)
  itemsProcessed    Int           @default(0)
  itemsFailed       Int           @default(0)
  error             String?
  correlationId     String        @unique
  idempotencyKey    String        @unique
  retryOf           String?       // baseKey (null for base attempt)
  retryCount        Int           @default(0)  // 0=base, 1=retry.1, 2=retry.2, 3=retry.3

  @@index([jobKey, startedAt])
  @@index([status])
  @@index([provider])
  @@index([retryOf])           // For logical-window queries
  // REMOVED: @@index([idempotencyKey]) — redundant with @unique
}

enum SyncJobType {
  FULL_CATALOG
  INCREMENTAL_EPISODES
  BACKFILL
  REPAIR
}

enum SyncJobStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILURE
  PARTIAL
}
```

### 1.2 Migration Strategy

```bash
# 1. Generate migration
npx prisma migrate dev --name "add-phase2-sync-models"

# 2. Verify schema
npx prisma validate

# 3. Generate client
npx prisma generate
```

---

## 2. Retry/Idempotency Semantics

### 2.1 Retry Semantics (Frozen)

| Attempt | retryCount | idempotencyKey | retryOf |
|---------|------------|----------------|---------|
| Base | 0 | `sync.full.consumet.2024-01-15` | `null` |
| Retry 1 | 1 | `sync.full.consumet.2024-01-15.retry.1` | `baseKey` |
| Retry 2 | 2 | `sync.full.consumet.2024-01-15.retry.2` | `baseKey` |
| Retry 3 | 3 | `sync.full.consumet.2024-01-15.retry.3` | `baseKey` |

**Invariants:**
- `retryOf = baseKey` for ALL retries; `null` for base attempt
- `maxRetries = 3` (base + 3 retries = 4 attempts max)
- `retryCount` increments sequentially: 0 → 1 → 2 → 3

### 2.2 Logical Window Queries (OR Pattern)

**All logical-window queries MUST use OR condition:**

```typescript
// Window completion: ANY attempt succeeded
const windowComplete = await prisma.syncJob.findFirst({
  where: {
    OR: [
      { idempotencyKey: baseKey },      // Base attempt
      { retryOf: baseKey }              // Any retry
    ],
    status: SyncJobStatus.SUCCESS
  }
});

// Any attempt RUNNING?
const running = await prisma.syncJob.findFirst({
  where: {
    OR: [
      { idempotencyKey: baseKey },
      { retryOf: baseKey }
    ],
    status: SyncJobStatus.RUNNING
  }
});

// Latest attempt (base OR retry)
const latest = await prisma.syncJob.findFirst({
  where: {
    OR: [
      { idempotencyKey: baseKey },
      { retryOf: baseKey }
    ]
  },
  orderBy: { retryCount: 'desc' }
);

// Retries exhausted?
const attempts = await prisma.syncJob.findMany({
  where: { retryOf: baseKey },
  orderBy: { retryCount: 'desc' }
});
const exhausted = attempts.length > 0 && attempts[0].retryCount >= maxRetries;
```

### 2.3 Success/Failure Rules

| State | Action |
|-------|--------|
| `SUCCESS` (base or any retry) | Window complete — no further execution |
| `FAILURE`/`PARTIAL` + `retryCount < maxRetries` | Create next retry with `.retry.N` |
| `FAILURE`/`PARTIAL` + `retryCount >= maxRetries` | Exhausted — no more retries |
| `SUCCESS` on any attempt | Prevents further retries for that logical window |

---

## 3. Race Safety

### 3.1 P2002 Handling

```typescript
// Atomic create with unique constraint
try {
  return await prisma.syncJob.create({
    data: {
      jobKey: input.jobKey,
      type: input.type,
      provider: input.provider,
      correlationId: crypto.randomUUID(),
      idempotencyKey: nextIdempotencyKey,
      retryOf: input.baseKey,
      retryCount: nextRetryCount,
      status: SyncJobStatus.PENDING,
    }
  });
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    // Race: another instance created it
    return prisma.syncJob.findUnique({ 
      where: { idempotencyKey: nextIdempotencyKey } 
    });
  }
  throw e;
}
```

### 3.2 Atomic PENDING → RUNNING Transition

```typescript
async function startJob(jobId: string): Promise<boolean> {
  const result = await prisma.syncJob.updateMany({
    where: { id: jobId, status: SyncJobStatus.PENDING },
    data: { status: SyncJobStatus.RUNNING, startedAt: new Date() }
  });
  return result.count > 0; // true = we won the race
}
```

### 3.3 Stale Worker Protection

```typescript
// Conditional completion - only if still RUNNING
async function finishJob(jobId: string, status: SyncJobStatus, data: FinishData): Promise<void> {
  const result = await prisma.syncJob.updateMany({
    where: { id: jobId, status: SyncJobStatus.RUNNING },
    data: { status, finishedAt: new Date(), error: data.error }
  });

  if (result.count === 0) {
    // Watchdog already changed state - stale worker
    logger.warn('Stale worker: job state already changed', { 
      correlationId, jobId, 
      expected: 'RUNNING', 
      actual: await prisma.syncJob.findUnique({ where: { id: jobId } })?.status 
    });
    return; // Do NOT overwrite watchdog result
  }
  // Normal completion - release lock, etc.
}
```

---

## 4. Redis Locks

### 4.1 Lock Structure

| Lock Type | Key | Purpose |
|-----------|-----|---------|
| Global | `sync:scheduler:lock` | Singleton scheduler instance |
| Provider | `sync:lock:{provider}` | Per-provider execution isolation |

### 4.2 Lock Token (UUID)

```typescript
// Lock value = raw UUID token
const token = crypto.randomUUID();

// Acquire: SET NX + TTL
async function acquireLock(key: string): Promise<string | null> {
  const token = crypto.randomUUID();
  const ok = await redis.set(key, token, 'EX', LOCK_TTL_SECONDS, 'NX');
  return ok ? token : null;
}

// Renew: Atomic Lua compare-and-extend
async function renewLock(key: string, token: string): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("expire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;
  return await redis.eval(script, 1, key, token, LOCK_TTL_SECONDS.toString()) === 1;
}

// Release: Atomic Lua compare-and-delete
async function releaseLock(key: string, token: string): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await redis.eval(script, 1, key, token);
  return result === 1;
}
```

**Invariants:**
- Lock value = raw UUID token (no JSON wrapper)
- Renewal: atomic Lua `GET == token ? EXPIRE : 0`
- Release: atomic Lua `GET == token ? DEL : 0`
- Old owner CANNOT renew/release after new owner acquires

### 4.3 Lock Types

| Lock | Key | TTL | Renewal |
|------|-----|-----|---------|
| Global | `sync:scheduler:lock` | 1h | Every 60s |
| Provider | `sync:lock:{provider}` | 1h | Every 60s |

**Global Lock:** Ensures single scheduler instance  
**Provider Lock:** Prevents overlapping syncs for same provider

---

## 5. Watchdog & Stale Worker Recovery

### 5.1 Watchdog Logic

```typescript
async function watchdog(): Promise<void> {
  const timeoutAgo = new Date(Date.now() - config.jobTimeoutMinutes * 60 * 1000);
  
  const timedOutJobs = await prisma.syncJob.findMany({
    where: {
      status: SyncJobStatus.RUNNING,
      startedAt: { lt: new Date(Date.now() - config.jobTimeoutMinutes * 60 * 1000) }
    }
  });

  for (const job of timedOutJobs) {
    // Mark as TIMED_OUT (FAILURE with specific error)
    await prisma.syncJob.update({
      where: { id: job.id },
      data: { 
        status: SyncJobStatus.FAILURE, 
        error: `Timeout after ${config.jobTimeoutMinutes} minutes`,
        finishedAt: new Date() 
      }
    );

    // DO NOT release lock - no ownership token
    // Rely on lock TTL expiry for cleanup
    logger.warn('Job timed out, lock will expire via TTL', {
      jobId: job.id, provider: job.provider, correlationId: job.correlationId
    });

    // Re-schedule recurring job
    if ([SyncJobType.FULL_CATALOG, SyncJobType.INCREMENTAL_EPISODES].includes(job.type)) {
      await scheduleNextRecurringRun(job.provider, job.type);
    }
  }
}
```

**Critical Invariants:**
- Watchdog NEVER releases Redis lock (no ownership token)
- Relies on lock TTL expiry for cleanup
- Stale worker conditional updates prevent overwrite
- New correlationId for each retry

---

## 6. Core Components

### 6.1 SyncAdapter Interface (`src/services/sync/adapters/SyncAdapter.ts`)

```typescript
export interface SyncAdapter {
  readonly providerId: string;
  readonly providerName: string;
  
  fetchFullCatalog(): Promise<SyncAnimeMeta[]>;
  fetchAnimeMeta(providerAnimeId: string): Promise<SyncAnimeMeta | null>;
  fetchEpisodeList(providerAnimeId: string): Promise<SyncEpisode[]>;
  healthCheck(): Promise<boolean>;
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
  providerEpisodeId: string;  // EXACT provider-supplied ID
  number: number;
  title?: string;
  isFiller?: boolean;
  airDate?: Date;
}
```

### 6.2 ConsumetSyncAdapter

```typescript
export class ConsumetSyncAdapter implements SyncAdapter {
  readonly providerId = 'consumet';
  readonly providerName = 'Consumet';

  private getProvider(): ConsumetProvider {
    const p = providerRegistry.getProvider('consumet');
    if (!p) throw new Error('ConsumetProvider not initialized');
    return p;
  }

  async fetchFullCatalog(): Promise<SyncAnimeMeta[]> {
    // Paginate /top-airing, /popular, /recent
    // Transform ConsumetAnimeInfo → SyncAnimeMeta
  }

  async fetchAnimeMeta(providerAnimeId: string): Promise<SyncAnimeMeta | null> {
    const detail = await this.getProvider().getAnimeInfo(providerAnimeId);
    return this.transform(detail);
  }

  async fetchEpisodeList(providerAnimeId: string): Promise<SyncEpisode[]> {
    const detail = await this.getProvider().getAnimeInfo(providerAnimeId);
    return detail.episodesList
      .filter(ep => ep.id)  // EXACT provider-supplied IDs only
      .map(ep => ({
        providerEpisodeId: ep.id,
        number: ep.number,
        title: ep.title,
        isFiller: ep.filler,
      }));
  }

  async healthCheck(): Promise<boolean> {
    return this.getProvider().healthCheck();
  }
}
```

### 6.3 AnivexaSyncAdapter

```typescript
export class AnivexaSyncAdapter implements SyncAdapter {
  readonly providerId = 'anivexa';
  readonly providerName = 'Anivexa';

  async fetchEpisodeList(providerAnimeId: string): Promise<SyncEpisode[]> {
    const detail = await this.getProvider().getAnimeInfo(providerAnimeId);
    return detail.episodesList
      .filter(ep => ep.id)
      .map(ep => ({
        providerEpisodeId: ep.id,  // EXACT provider-supplied ID
        number: ep.number,
        title: ep.title,
      }));
  }
}
```

---

### 6.4 SyncOrchestrator

```typescript
export class SyncOrchestrator {
  constructor(
    private prisma: PrismaClient,
    private adapters: Map<string, SyncAdapter>
  ) {}

  // Full catalog: sync anime with existing authoritative AniList IDs only
  async runFullCatalogSync(provider: string): Promise<SyncJobResult> {
    const adapter = this.getAdapter(provider);
    const catalog = await adapter.fetchFullCatalog();
    
    for (const meta of catalog) {
      // ONLY sync entries with EXISTING authoritative AniList IDs
      const existingAnime = await this.prisma.anime.findFirst({
        where: { providerMappings: { path: [provider], equals: meta.providerAnimeId } }
      });
      
      if (existingAnime) {
        await this.syncAnimeByAniListId(existingAnime.anilistId);
      } else {
        // DEFER - no authoritative AniList ID
        logger.info('Deferred - no authoritative AniList ID', { 
          provider, providerAnimeId: meta.providerAnimeId 
        });
      }
    }
  }

  // Incremental: provider-scoped, consumes Phase 1 DiscoveredRelease read-only
  async processNewReleases(provider: string, limit = 500): Promise<void> {
    const releases = await this.prisma.discoveredRelease.findMany({
      where: { provider, lifecycleState: ReleaseLifecycleState.DISCOVERED },
      take: limit,
      orderBy: { firstSeenAt: 'asc' }
    });

    for (const release of releases) {
      const existingAnime = await this.prisma.anime.findFirst({
        where: { providerMappings: { path: [provider], equals: release.providerAnimeId } }
      });
      
      if (existingAnime) {
        await this.syncAnimeByAniListId(existingAnime.anilistId);
      } else {
        logger.debug('Deferred incremental release - no mapping', { 
          provider, providerAnimeId: release.providerAnimeId 
        });
      }
    }
  }

  // Core sync: Anime + Episodes for mapped provider
  async syncAnimeByAniListId(anilistId: number): Promise<void> {
    const mapping = await mappingService.resolveProviderId(anilistId);
    if (!mapping) return; // No mapping → defer

    const anilist = await anilistService.getDetail(anilistId);
    const anime = await this.prisma.anime.upsert({
      where: { anilistId },
      update: { 
        providerMappings: { 
          ...(await this.prisma.anime.findUnique({ where: { anilistId }, select: { providerMappings: true } }))?.providerMappings || {},
          [mapping.providerName]: mapping.providerId 
        },
        syncStatus: AnimeSyncStatus.SYNCING,
      },
      create: { anilistId, providerMappings: { [mapping.providerName]: mapping.providerId }, ... }
    });

    await this.syncEpisodesForProvider(anime.id, mapping.providerName, mapping.providerId);
    
    await this.prisma.anime.update({
      where: { id: anime.id },
      data: { syncStatus: AnimeSyncStatus.MAPPED, lastSyncedAt: new Date() }
    });
  }

  // Episode sync with provider-scoped ID preservation
  async syncEpisodesForProvider(animeId: number, provider: string, providerAnimeId: string): Promise<void> {
    const adapter = this.getAdapter(provider);
    const episodeList = await adapter.fetchEpisodeList(providerAnimeId);

    for (const ep of episodeList) {
      if (!ep.providerEpisodeId) continue; // Skip invalid

      await this.prisma.episode.upsert({
        where: { animeId_number: { animeId, number: ep.number } },
        update: {
          providerEpisodeIds: { [provider]: ep.providerEpisodeId },
          syncStatus: EpisodeSyncStatus.MAPPED,
        },
        create: {
          animeId, number: ep.number, title: ep.title,
          isFiller: ep.isFiller, airDate: ep.airDate,
          providerEpisodeIds: { [provider]: ep.providerEpisodeId },
          syncStatus: EpisodeSyncStatus.MAPPED,
        }
      });
    }
  }

  // Availability: calls Phase 3 contract
  async checkAvailability(episodeId: string): Promise<boolean> {
    const episode = await this.prisma.episode.findUnique({ 
      where: { id: episodeId }, include: { anime: true } 
    });
    if (!episode || episode.syncStatus === EpisodeSyncStatus.AVAILABLE) return true;

    for (const [provider, providerAnimeId] of Object.entries(episode.anime.providerMappings)) {
      try {
        const sources = await providerRegistry.getEpisodeSourcesWithFallback(
          providerAnimeId, episode.number
        );
        if (sources.length > 0) {
          await this.prisma.episode.update({
            where: { id: episodeId },
            data: { syncStatus: EpisodeSyncStatus.AVAILABLE, lastSyncedAt: new Date() }
          });
          return true;
        }
      } catch (e) { logger.warn('Availability check failed', { provider, error: e }); }
    }
    return false;
  }
}
```

---

## 7. Phase Boundaries (Immutable)

| Boundary | Rule | Enforcement |
|----------|------|-------------|
| **Phase 1 → Phase 2** | Phase 2 READS `DiscoveredRelease` only | No mutations to `lifecycleState`, no `ScanJob` creation |
| **Phase 2 → Phase 3** | Phase 2 CALLS `mappingService.resolveProviderId()` | No reverse mapping, no `mappingCache` access |
| **Phase 2 → Phase 3** | Phase 2 CALLS `ProviderRegistry.getEpisodeSourcesWithFallback()` | No direct provider calls |
| **Phase 3** | FROZEN — no modifications | `mappingService`, `ProviderRegistry`, `anilistService`, `StreamingProvider` |
| **Phase 1** | Read-only to Phase 2 | `DiscoveredRelease` lifecycleState = `DISCOVERED` only |

### Forbidden in Phase 2:
- ❌ `mappingCache` direct access
- ❌ `mappingService` reverse lookup (`Provider → AniList`)
- ❌ `ProviderRegistry.getProvider()` direct use
- ❌ `DiscoveredRelease.lifecycleState` mutation
- ❌ `ScanJob` creation
- ❌ `StreamingProvider` interface implementation
- ❌ Another provider registry / mapping system / cache

---

## 8. SyncScheduler Design

### 8.1 Schedules

| Job Type | Trigger | Interval | Idempotency Key |
|----------|---------|----------|-----------------|
| Full Catalog | Scheduled | 24h (configurable) | `sync.full.{provider}.{YYYY-MM-DD}` |
| Incremental | Scheduled | 30 min (configurable) | `sync.incremental.{provider}.{windowStart}` |
| Backfill | Manual/API | On-demand | `sync.backfill.{provider}.{anilistId}` |
| Repair | Manual/API | On-demand | `sync.repair.{provider}.{anilistId}` |

### 8.2 Scheduler Config (`src/config/sync.ts`)

```typescript
export const syncSchedulerConfigSchema = z.object({
  fullCatalogIntervalHours: z.coerce.number().int().positive().default(24),
  incrementalIntervalMinutes: z.coerce.number().int().positive().default(30),
  maxConcurrentProviders: z.coerce.number().int().positive().default(2),
  jobTimeoutMinutes: z.coerce.number().int().positive().default(120),
  maxRetries: z.coerce.number().int().positive().default(3),
  lockTtlSeconds: z.coerce.number().int().positive().default(3600),
  lockRenewalIntervalSeconds: z.coerce.number().int().positive().default(60),
});
```

### 8.3 Scheduler State Machine

```
PENDING → (acquire lock) → RUNNING → (success) → SUCCESS
                              ↘ (failure/timeout) → FAILURE/PARTIAL → retry
                                                              ↘ maxRetries exhausted → stop
```

---

## 8. Routes & Startup

### 8.1 Admin Routes (`src/routes/sync.ts`)

```typescript
// POST /api/sync/trigger/full/:provider
// POST /api/sync/trigger/incremental/:provider
// POST /api/sync/trigger/backfill/:provider/:anilistId
// POST /api/sync/trigger/repair/:provider/:anilistId
// GET /api/sync/status
// GET /api/sync/jobs
// GET /api/sync/jobs/:id
```

### 8.2 Startup Integration (`src/index.ts`)

```typescript
// In startServer():
const syncScheduler = await createSyncScheduler(prisma, syncOrchestrator);
await syncScheduler.start();

// Shutdown:
process.on('SIGTERM', async () => {
  await syncScheduler.stop();
  // ... existing shutdown
});
```

### 8.3 Concurrency Config

```typescript
// SyncScheduler config
{
  maxConcurrentProviders: 2,      // Max simultaneous provider syncs
  jobTimeoutMinutes: 120,         // Watchdog timeout
  maxRetries: 3,                  // Base + 3 retries
  lockTtlSeconds: 3600,           // Lock TTL
  lockRenewalIntervalSeconds: 60, // Renewal interval
}
```

---

## 9. Tests

### Test Structure

```
tests/sync/
├── scheduler-retry-semantics.test.ts      # retryOf semantics
├── scheduler-window-queries.test.ts       # Logical window queries
├── scheduler-idempotency-retry.test.ts    # Idempotency/retry
├── scheduler-concurrency.test.ts          # Concurrent execution
├── scheduler-lock-lifecycle.test.ts       # Lock atomicity
├── scheduler-watchdog.test.ts             # Watchdog/stale worker
├── scheduler-full-catalog.test.ts         # Full catalog sync
├── scheduler-incremental.test.ts          # Incremental sync
├── scheduler-provider-isolation.test.ts   # Provider scoping
├── scheduler-boundaries.test.ts           # Phase boundaries
├── provider-isolation.test.ts             # Provider identity
├── idempotency/
│   ├── anime-idempotency.test.ts
│   ├── episode-idempotency.test.ts
│   ├── job-idempotency.test.ts
│   └── provider-preservation.test.ts
├── failure-injection/
│   └── provider-failures.test.ts
└── static/
    ├── phase-boundaries.test.ts          # AST boundary checks
    ├── sync-boundaries.test.ts           # Sync boundary checks
    └── duplicate-services.test.ts
```

### Key Test Invariants

```typescript
// Retry semantics
it('base attempt: retryCount=0, retryOf=null');
it('retry.1: retryCount=1, retryOf=baseKey');
it('retry.2/3 follow same pattern');

// Logical window queries
it('SUCCESS on base attempt → window complete');
it('SUCCESS on retry.1 → window complete');
it('latest attempt sees base + retries');
it('retries exhausted after retry.3 fails');

// Concurrency
it('concurrent getOrCreateRunnableJob → single attempt');

// Lock atomicity
it('owner can renew/release own lock');
it('wrong token cannot renew/release');
it('expired lock → new owner can acquire');
it('old owner cannot renew/release new owner lock');

// Watchdog
it('RUNNING job timeout → FAILURE');
it('watchdog does not delete lock');
it('stale worker cannot overwrite watchdog FAILURE');
```

---

## 10. Files to Create/Modify

### New Files (Implementation Order)

| Order | File | Purpose |
|-------|------|---------|
| 1 | `prisma/schema.prisma` | Add SyncJob, Anime, Episode models + enums |
| 2 | `src/services/sync/types.ts` | Type definitions |
| 3 | `src/services/sync/locks.ts` | Redis lock utilities (atomic Lua) |
| 4 | `src/services/sync/adapters/SyncAdapter.ts` | Shared interface |
| 5 | `src/services/sync/adapters/ConsumetSyncAdapter.ts` | Consumet adapter |
| 6 | `src/services/sync/adapters/AnivexaSyncAdapter.ts` | Anivexa adapter |
| 7 | `src/services/sync/adapters/index.ts` | Adapter registry |
| 8 | `src/services/sync/SyncOrchestrator.ts` | Core sync logic |
| 8 | `src/services/sync/AvailabilityPipeline.ts` | Availability check |
| 9 | `src/services/sync/SyncScheduler.ts` | Main scheduler |
| 10 | `src/services/sync/config/sync.ts` | Zod config |
| 10 | `src/services/sync/errors.ts` | Error types |
| 10 | `src/services/sync/index.ts` | Public exports |
| 10 | `src/routes/sync.ts` | Admin API routes |
| 11 | `src/routes.ts` | Mount sync router |
| 11 | `src/index.ts` | Initialize SyncScheduler |

### Modified Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add SyncJob, Anime, Episode models + enums; remove redundant index |
| `src/services/sync/types.ts` | Add types for SyncJob, SyncJobType, SyncJobStatus, lock tokens |
| `src/routes.ts` | Mount sync router at `/api/sync` |
| `src/index.ts` | Initialize SyncScheduler on startup |

### Test Files (New)

| File | Purpose |
|------|---------|
| `tests/sync/scheduler-retry-semantics.test.ts` | RetryOf semantics |
| `tests/sync/scheduler-window-queries.test.ts` | Logical window queries |
| `tests/sync/scheduler-idempotency-retry.test.ts` | Idempotency/retry |
| `tests/sync/scheduler-concurrency.test.ts` | Concurrent execution |
| `tests/sync/scheduler-lock-lifecycle.test.ts` | Lock atomicity |
| `tests/sync/scheduler-watchdog.test.ts` | Watchdog/stale worker |
| `tests/sync/scheduler-full-catalog.test.ts` | Full catalog sync |
| `tests/sync/scheduler-incremental.test.ts` | Incremental sync |
| `tests/sync/scheduler-provider-isolation.test.ts` | Provider scoping |
| `tests/sync/scheduler-boundaries.test.ts` | Phase boundaries |
| `tests/static/sync-boundaries.test.ts` | AST boundary checks |
| `tests/isolation/provider-isolation.test.ts` | Provider identity |
| `tests/idempotency/*.test.ts` | Idempotency tests |
| `tests/failure-injection/provider-failures.test.ts` | Failure injection |
| `tests/dependency/circular-deps.test.ts` | Circular dependency checks |

---

## Protected Areas (DO NOT MODIFY)

### Phase 1 (Discovery) - READ ONLY

| File | Purpose | Access |
|------|---------|--------|
| `src/services/discovery/DiscoveryAdapter.ts` | Base discovery adapter | READ ONLY |
| `src/services/discovery/ProviderDiscovery.ts` | Discovery orchestrator | READ ONLY |
| `src/services/discovery/DiscoveryScheduler.ts` | Discovery scheduler | READ ONLY |
| `src/services/discovery/HealthMonitor.ts` | Health monitoring | READ ONLY |
| `src/services/discovery/adapters/ConsumetDiscoveryAdapter.ts` | Consumet discovery | READ ONLY |
| `src/services/discovery/adapters/AnivexaDiscoveryAdapter.ts` | Anivexa discovery | READ ONLY |
| `src/services/discovery/index.ts` | Exports | READ ONLY |
| `src/types/discovery.ts` | Discovery types | READ ONLY |
| `src/config/discovery.ts` | Discovery config | READ ONLY |

### Phase 3 (Frozen) - DO NOT MODIFY

| File | Purpose | Access |
|------|---------|--------|
| `src/services/mapping.ts` | `mappingService` | FROZEN |
| `src/services/streaming/index.ts` | `ProviderRegistry` | FROZEN |
| `src/services/streaming/Provider.ts` | `StreamingProvider` interface | FROZEN |
| `src/services/streaming/ConsumetProvider.ts` | Consumet provider | FROZEN |
| `src/services/streaming/AnivexaProvider.ts` | Anivexa provider | FROZEN |
| `src/services/streaming/CircuitBreaker.ts` | Circuit breaker | FROZEN |
| `src/services/anilist.ts` | `anilistService` | FROZEN |
| `src/services/cache.ts` | Cache services | FROZEN (read-only usage) |
| `src/types/anilist.ts` | AniList types | FROZEN |

### Protected Contracts (Phase 3)

| Contract | Usage in Phase 2 |
|----------|------------------|
| `mappingService.resolveProviderId(anilistId)` | ✅ Read-only |
| `mappingService.invalidateMapping(anilistId)` | ✅ Read-only |
| `mappingService.getMappingStatus(anilistId)` | ✅ Read-only |
| `ProviderRegistry.getAllProviders()` | ✅ Health checks only |
| `ProviderRegistry.getEpisodeSourcesWithFallback(providerAnimeId, episode)` | ✅ Availability |
| `ProviderRegistry.getAnimeInfoWithFallback(providerId)` | ✅ Metadata fallback |
| `anilistService.getDetail(anilistId)` | ✅ Canonical metadata |

---

## Verification Checklist

### Pre-Implementation Verification

- [ ] Prisma 5.16.0 compatibility verified
- [ ] SyncJob schema designed with correct indexes
- [ ] Retry semantics documented (base=0, retryOf=null; retries use baseKey)
- [ ] Logical-window OR queries designed (baseKey OR retryOf=baseKey)
- [ ] P2002 handling pattern defined
- [ ] Atomic PENDING→RUNNING transition defined
- [ ] Stale worker protection with conditional updates
- [ ] Redis lock: UUID tokens, atomic Lua renew/release
- [ ] Global vs provider lock separation
- [ ] Watchdog timeout → FAILURE, no lock release
- [ ] Stale worker conditional updates prevent overwrite
- [ ] Phase 1 read-only enforcement
- [ ] Phase 3 contracts unchanged
- [ ] No reverse Provider→AniList mapping
- [ ] No duplicate provider/mapping/cache systems

### Post-Implementation Verification

```bash
# Type checking
npx tsc --noEmit

# Build
npm run build

# Lint
npm run lint

# Tests
npm run test

# Specific test suites
npm run test -- tests/sync/
npm run test -- tests/static/
npm run test -- tests/isolation/
npm run test -- tests/idempotency/
npm run test -- tests/failure-injection/
npm run test -- tests/dependency/
```

---

## Unresolved Contradictions

| # | Issue | Status |
|---|-------|--------|
| 1 | **Consumet episode ID format** | ❓ PENDING - Need verification script against Consumet API |
| 2 | **Anivexa episode ID stability** | ⚠️ UNVERIFIED - Need test against 3+ providers |
| 3 | **Season/episode separation** | ❓ PENDING - Test if providers distinguish season+episode |
| 4 | **Special episode encoding** | ❓ PENDING - OVA/special encoding verification |

**Resolution:** These MUST be resolved before enabling idempotent upserts. Recommendation: Implement Phase 2 with verification gate — first sync run validates episode ID stability before enabling idempotent upserts. If unstable, fall back to composite key with `airDate?`.

---

## Final Verdict

**PLAN STATUS: APPROVED FOR IMPLEMENTATION**

**All architectural decisions finalized. No Phase 1/3 modifications required. No duplicate systems. All retry/idempotency/locking semantics finalized. Ready for implementation upon resolution of episode ID verification.**

---

**Plan Location:** `/root/anime-streaming/.opencode/plans/phase2-synchronization-plan.md`  
**Implementation Order:** See Section 10 (Files to Create/Modify)  
**Protected Areas:** Section 11 (Explicitly Listed)  
**Verification:** Section 12 (Checklists)  
**Unresolved:** Section 13 (Episode ID Verification)  

---

**END OF PLAN**  
**DO NOT IMPLEMENT — PLAN MODE ONLY**  
**Awaiting explicit implementation authorization**PLAN_EOF
