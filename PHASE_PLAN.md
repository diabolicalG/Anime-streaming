# Anime Streaming Website — Development Plan

**Location:** `/root/anime-streaming/PHASE_PLAN.md`

---

## 1. COMPLETED PHASE 1 RESEARCH — 8 REFERENCE REPOSITORIES

| # | Repository | Clone Path | Key Findings |
|---|------------|------------|--------------|
| 1 | TehNut/AniSchedule | `/root/anime-streaming-reference/AniSchedule/` | Recursive 24h scheduler, time-windowed AniList queries, pagination, in-memory duplicate queue (must replace with persisted state) |
| 2 | yjl9903/AnimeGarden | `/root/anime-streaming-reference/AnimeGarden/` | Provider adapters, PostgreSQL/Drizzle schema, `fetchLatestPages` dedup, `upsertResources()`, cron jobs, Redis caching |
| 3 | hexxt-git/anime-sdk | `/root/anime-streaming-reference/anime-sdk/` | URN identity (`${providerId}:${rawId}`), `BaseProvider` with semaphore, `MappingClient` 3-tier resolution, `IContentUnit` episode structure |
| 4 | RafaelChipitelli/anime-airing-notify | `/root/anime-streaming-reference/anime-airing-notify/` | JSON state file, duplicate suppression (`aired <= state[key]`), silent adoption, outage `_paused` flag, state pruning |
| 5 | RockinChaos/AniSchedule | `/root/anime-streaming-reference/RockinChaos-AniSchedule/` | Animeschedule.net API, JSON file persistence, change tracking, gap detection, DST handling |
| 6 | Logan2234/loomkeep | `/root/anime-streaming-reference/loomkeep/` | NestJS job runner, `JobRunService.record()` wrapper, Healthchecks.io ping, JobRun persistence/pruning |
| 7 | vibeMonarch/vibeDebrid | `/root/anime-streaming-reference/vibeDebrid/` | Explicit state machine (`VALID_TRANSITIONS`), exponential backoff + DORMANT, stuck job recovery, transition side-effects |
| 6. walterwhite-69/Anivexa-API | `/root/anime-streaming-reference/Anivexa-API/` | Cloudflare Workers, 13 providers, episode identity via cover-image AniList ID, episode merging, KV cache, AniZip mappings |

---

## 2. PHASE 1 IMPLEMENTATION SEQUENCE

### Phase 1A: Foundation (Week 1-2)
| Task | Source Pattern | Files to Create |
|------|---------------|-----------------|
| Prisma schema extensions | AnimeGarden `resources.ts` + vibeDebrid | `prisma/schema.prisma` (+ `DiscoveredRelease`, `ScanJob`, `ReleaseState`) |
| Discovery types | anime-sdk `types.ts` + vibeDebrid `QueueState` | `src/types/discovery.ts` |
| Zod config schema | loomkeep `job-keys.ts` + AnimeGarden | `src/config/discovery.ts` |
| Base discovery adapter | anime-sdk `BaseProvider` + AnimeGarden `DiscoveryAdapter` | `src/services/discovery/adapters/DiscoveryAdapter.ts` |

### Phase 1B: Core Discovery (Week 2-3)
| Task | Source Pattern | Files |
|------|----------------|-------|
| Consumet/Anivexa adapters | AnimeGarden `DiscoveryAdapter` + anime-sdk `BaseProvider` | `adapters/ConsumetDiscoveryAdapter.ts`, `AnivexaDiscoveryAdapter.ts` |
| ProviderDiscovery orchestrator | AnimeGarden `ProviderDiscovery` + loomkeep `JobRunService` | `ProviderDiscovery.ts` |
| DiscoveryScheduler | loomkeep `JOB_REGISTRY` + RockinChaos `initScheduler` | `DiscoveryScheduler.ts` |
| HealthMonitor | vibeDebrid health checks + loomkeep Healthchecks.io | `HealthMonitor.ts` |

### Phase 1C: Persistence & Idempotency (Week 3-4)
| Task | Source Pattern | Files |
|------|----------------|-------|
| Idempotent upsert | vibeDebrid `transition()` + AnimeGarden `upsertResources()` | `DiscoveredRelease` Prisma upsert |
| FirstSeenAt/LastSeenAt | vibeDebrid `state_changed_at` + anime-airing-notify `state[key]` | `firstSeenAt` (immutable), `lastSeenAt` (updates) |
| Release lifecycle states | vibeDebrid `QueueState` + anime-airing-notify silent adopt | `DISCOVERED → CATALOGED → MAPPING_PENDING → MAPPED → AVAILABLE` |
| New release counting | anime-airing-notify `a["aired"] > state[key]` | Only increment on INSERT, not SELECT |
| Episode ID verification | **MUST VERIFY BEFORE** | Provider episode ID verification script |

### Phase 1D: Observability & Polish (Week 5)
| Task | Source Pattern |
|------|----------------|
| Healthchecks.io ping | loomkeep `JobRunService.ping()` |
| Scan job history + pruning | loomkeep `JobRunService.persist()` + `prune()` |
| Structured logging | vibeDebrid structured logging + correlation IDs |
| HealthMonitor + circuit breaker | vibeDebrid HealthMonitor + anime-sdk CircuitBreaker |

---

## 3. PHASE 1 → PHASE 3 INTEGRATION BOUNDARY

### Phase 3 Contracts (FROZEN — DO NOT MODIFY)

| Contract | Phase 1 Consumption | Status |
|----------|---------------------|--------|
| `mappingService.resolveProviderId()` | ✅ Called by `catalogSync` after discovery | ✅ Preserved |
| `mappingService.invalidateMapping()` | ✅ Available for cache invalidation | ✅ Preserved |
| `mappingService.getMappingStatus()` | ✅ Available for monitoring | ✅ Preserved |
| `mappingCache` | ✅ Not used by discovery (separate Redis prefix) | ✅ Preserved |
| `anilistService` | ✅ Not used by discovery (provider-side only) | ✅ Preserved |
| `ProviderRegistry` | ✅ Used for health checks + provider enumeration | ✅ Preserved |
| `StreamingProvider` interface | ✅ Adapters wrap existing providers | ✅ Preserved |
| Phase 3 types | ✅ Shared types only (`ProviderSearchResult`, etc.) | ✅ Preserved |

**Phase 1 only CONSUMES Phase 3 contracts. Does NOT modify them.**

---

## 4. PHASE 3 IMPROVEMENT SEQUENCE (Post-Phase 1)

| Priority | Improvement | Rationale |
|----------|-------------|-----------|
| 1 | Add circuit breaker metrics to ProviderRegistry | Observability |
| 2 | Implement provider health dashboard | Observability |
| 3 | Add retry-after headers to provider errors | Resilience |
| 4 | Improve MappingService confidence scoring | Accuracy |
| 5 | Add AniList webhook support for real-time updates | Latency reduction |
| 5 | Implement provider-specific rate limit configs | Operational |

---

## 5. PHASE 4 SCOPE — CANVA + OBSIDIAN BLACK PREMIUM CINEMATIC

### Phase 4A: Watch Page & Video Player
| Component | Scope |
|-----------|-------|
| **Video Player** | HLS.js + video.js, quality/subtitle selection, picture-in-picture, keyboard shortcuts |
| **Episode Navigation** | Next/prev, episode list, progress tracking, skip intro/outro |
| **Subtitles** | VTT/ASS, language selection, offset, font customization |
| **Quality Selection** | Auto/1080p/720p/480p/360p, adaptive bitrate |

### Phase 4B: Premium Cinematic Experience (Canva + Obsidian Black)
| Feature | Description |
|---------|-------------|
| **Cinematic UI** | Obsidian Black theme, cinematic letterbox, ambient lighting |
| **Canva Integration** | Custom thumbnails, branded overlays, dynamic episode cards |
| **Ambient Mode** | Dimmed UI during playback, auto-hide controls |
| **Cinematic Transitions** | Episode-to-episode crossfade, credit skip detection |
| **Premium Themes** | Obsidian Black (default), Cinema Dark, Anime Light |
| **Smart Resume** | Cross-device sync, intelligent resume (skip recap/credits) |

### Phase 4B: Premium Cinematic Experience (Canva + Obsidian Black)
| Feature | Description |
|---------|-------------|
| **Cinematic UI** | Obsidian Black theme, cinematic letterbox, ambient lighting |
| **Canva Integration** | Custom thumbnails, branded overlays, dynamic episode cards |
| **Ambient Mode** | Dimmed UI during playback, auto-hide controls |
| **Cinematic Transitions** | Episode-to-episode crossfade, credit skip detection |
| **Premium Themes** | Obsidian Black (default), Cinema Dark, Anime Light |
| **Smart Resume** | Cross-device sync, intelligent resume (skip recap/credits) |

### Phase 4C: Social & Discovery
| Feature | Description |
|---------|-------------|
| **Watch Parties** | Synchronized playback, chat, reactions |
| **Collections** | User-curated lists, public/private, shareable |
| **Recommendations** | Collaborative filtering + content-based |
| **Activity Feed** | Friends' watches, reviews, lists |

---

## 6. PHASE 5 FUTURE SCOPE

| Area | Vision |
|------|--------|
| **AI-Powered** | Smart episode grouping, auto-skip filler/recap, content-aware quality |
| **Offline/Edge** | PWA, background sync, edge CDN for streams |
| **Creator Tools** | Custom subtitles, community translations, timestamp editing |
| **Platform** | TV apps (Android TV, Apple TV, Fire TV), mobile apps |
| **Monetization** | Optional premium tiers, creator revenue sharing |
| **Federation** | ActivityPub for cross-instance discovery |

---

## 7. PHASE ORDERING RULE

**Phase 1 → Phase 3 → Phase 4 → Phase 5**

| Phase | Status | Dependency |
|-------|--------|------------|
| Phase 1 | **READY TO IMPLEMENT** | Foundation + Discovery |
| Phase 3 | **COMPLETE (FROZEN)** | ProviderRegistry, MappingService, anilistService, StreamingProvider |
| Phase 4 | **BLOCKED on Phase 1** | Watch Page, Player, Premium UI |
| Phase 5 | **BLOCKED on Phase 4** | AI, Offline, Federation |

---

## 8. FROZEN PHASE 3 CONTRACTS & ARCHITECTURAL RULES

### Frozen Phase 3 Contracts (DO NOT MODIFY)
| Contract | File | Status |
|----------|------|--------|
| `mappingService.resolveProviderId()` | `apps/backend/src/services/mapping.ts` | ✅ FROZEN |
| `ProviderRegistry` | `apps/backend/src/services/streaming/index.ts` | ✅ FROZEN |
| `StreamingProvider` interface | `apps/backend/src/services/streaming/Provider.ts` | ✅ FROZEN |
| `mappingCache` | `apps/backend/src/services/cache.ts` | ✅ FROZEN |
| `anilistService` | `apps/backend/src/services/anilist.ts` | ✅ FROZEN |
| Phase 3 types | `apps/backend/src/types/anilist.ts` | ✅ FROZEN |

### Major Architectural Rules
| Rule | Description |
|------|-------------|
| **Phase ordering** | Phase 1 → Phase 3 → Phase 4 → Phase 5 (strict) |
| **Phase 3 frozen** | No modifications to Phase 3 contracts after Phase 1 |
| **No duplicate mapping** | Phase 1 discovery only; Phase 3 owns mapping |
| **No duplicate provider registry** | Phase 1 uses existing `ProviderRegistry` |
| **No stream data in discovery** | Discovery outputs `DiscoveredRelease` only (no URLs, headers, subtitles) |
| **Deterministic identity** | `(provider, providerAnimeId, providerEpisodeId)` — must be verified |
| **Idempotent upserts only** | Count "new" only on INSERT, not SELECT |
| **Bounded concurrency** | `p-limit` per provider, global limit |
| **RAM-conscious** | Stream provider pages, process in batches, no full catalog in memory |
| **Structured logging** | Correlation IDs, structured fields |
| **Healthchecks.io pings** | All scheduled jobs |
| **Small prompts** | Work in small, controlled increments |

---

## 9. SMALL PROMPTS RULE

**Work in small, controlled prompts. Avoid unrelated changes.**

| Rule | Enforcement |
|------|-------------|
| **One logical change per prompt** | Fix one issue, verify, commit, next prompt |
| **No unrelated refactoring** | Only touch files directly related to the task |
| **Validate after each change** | `npx tsc --noEmit`, `npm run build`, `npm run lint` |
| **No large refactors in one prompt** | Break into atomic changes |
| **Ask before scope creep** | Stop and ask if new work emerges |
| **Phase 3 is immutable** | Never modify frozen contracts |

---

## 10. IDENTITY DECISION — REQUIRES VERIFICATION

**The deterministic release identity `(provider, providerAnimeId, providerEpisodeId)` is PENDING PROVIDER-LEVEL VERIFICATION.**

| Pattern | Status | Verification Needed |
|---------|--------|---------------------|
| AnimeGarden `(provider, providerId, providerEpisodeId)` | ✅ PROVEN | PostgreSQL unique index |
| anime-sdk URN | ✅ PROVEN | `buildUrn()`/`unwrapUrn()` |
| anime-airing-notify | ✅ PROVEN | `state[key] = aired` |
| vibeDebrid | ✅ PROVEN | DB unique constraint |
| **Consumet provider** | ❓ PENDING | Need to verify `episodesList[].id` format |
| **Anivexa 13 providers** | ⚠️ UNVERIFIED | Need to test 3+ providers |

**REQUIRED BEFORE IMPLEMENTATION:** Write test script against Consumet/Anivexa to verify episode ID format stability and format consistency.

---

## 11. PHASE 3 COMPATIBILITY — EXPLICIT CONFIRMATION

| Requirement | Status |
|-------------|--------|
| No MappingService modification | ✅ Confirmed - Phase 1 only consumes `resolveProviderId()` |
| No ProviderRegistry modification | ✅ Confirmed - Phase 1 only reads provider list for health checks |
| No mappingCache modification | ✅ Confirmed - Discovery uses separate Redis prefix `discovery:` |
| No AniList integration modification | ✅ Confirmed - Discovery uses provider APIs only |
| No Anivexa integration modification | ✅ Confirmed - Discovery wraps existing providers via adapters |
| No mapping cache modification | ✅ Confirmed |
| No duplicate mapping architecture | ✅ Confirmed - Phase 1 only discovers, doesn't map |
| No Phase 4 stream persistence | ✅ Confirmed - Discovery has NO stream URLs |
| No Watch Page/player logic | ✅ Confirmed - Discovery has NO stream resolution |

---

## 11. REJECTED PATTERNS

| Category | Rejected Pattern | Source | Reason |
|----------|------------------|--------|--------|
| **Persistence** | JSON file storage | AniSchedule, RockinChaos, anime-airing-notify | Use PostgreSQL |
| **Persistence** | In-memory state | AniSchedule `queuedIds`, AniSchedule `announcementTimouts` | Use PostgreSQL |
| **Architecture** | Discord bot | AniSchedule, Loomkeep | Not applicable |
| **Architecture** | Discord bot logic | Loomkeep Discord commands | Not applicable |
| **Auth** | MAL API integration | anime-airing-notify, anime-sdk | Not in scope |
| **External** | AniList GraphQL discovery | All three repos | Phase 3 owns AniList |
| **External** | MALSync / Anify / arm-server | anime-sdk MappingClient | Phase 3 owns mapping |
| **Infra** | SQLite | AniSchedule | Use PostgreSQL |
| **External** | Discord webhook/embeds | anime-airing-notify, RockinChaos | Not applicable |
| **External** | AniList discovery/mapping | All three repos | Phase 3 owns AniList |
| **External** | MALSync / Anify / arm-server | anime-sdk MappingClient | Phase 3 owns mapping |
| **Infra** | SQLite | AniSchedule | Use PostgreSQL |
| **External** | Discord webhook/embeds | anime-airing-notify, RockinChaos | Not applicable |
| **External** | AniList discovery/mapping | All three repos | Phase 3 owns AniList |
| **External** | MALSync / Anify / arm-server | anime-sdk MappingClient | Phase 3 owns mapping |
| **Infra** | SQLite | AniSchedule | Use PostgreSQL |
| **External** | Discord | Loomkeep, AniSchedule | Not applicable |

---

## 12. UNRESOLVED QUESTIONS

### MUST RESOLVE BEFORE IMPLEMENTATION
| # | Question | Resolution Path |
|---|----------|-----------------|
| 1 | **Consumet provider episode ID format** | Write test script against Consumet API to inspect `getAnimeInfo().episodesList[].id` format |
| 2 | **Anivexa episode ID stability** | Write test against 3 providers (reanime, anikoto, mkissa) to verify episode ID format stability |
| 3 | **Season/episode separation** | Test if providers distinguish season+episode vs absolute episode number |
| 3 | **Special episode encoding** | How do providers encode OVAs/specials (ep 0, -1, 1.5, SP1 |

### CAN RESOLVE DURING IMPLEMENTATION
| # | Question |
|---|----------|
| 1 | Optimal `scanIntervalMinutes` per provider |
| 2 | Optimal `maxReleasesPerScan` per provider |
| 3 | Optimal `batchSize` for batch processing |
| 4 | Optimal Redis key TTLs for discovery cache |
| 5 | Whether to use `p-limit` or custom semaphore |

---

## 8. PHASE 3 COMPATIBILITY — EXPLICIT CONFIRMATION

| Requirement | Status |
|-------------|--------|
| No MappingService modification | ✅ Confirmed - Phase 1 only consumes `resolveProviderId()` |
| No ProviderRegistry modification | ✅ Confirmed - Phase 1 only reads provider list for health checks |
| No mappingCache modification | ✅ Confirmed - Discovery uses separate Redis prefix `discovery:` |
| No AniList integration modification | ✅ Confirmed - Discovery uses provider APIs only |
| No Anivexa integration modification | ✅ Confirmed - Discovery wraps existing providers via adapters |
| No mapping cache modification | ✅ Confirmed |
| No duplicate mapping architecture | ✅ Confirmed - Phase 1 only discovers, doesn't map |
| No Phase 4 stream persistence | ✅ Confirmed - Discovery has NO stream URLs |
| No Watch Page/player logic | ✅ Confirmed - Discovery has NO stream resolution |

---

## FINAL DECISION

**IDENTITY DECISION:** The deterministic release identity `(provider, providerAnimeId, providerEpisodeId)` is **PENDING PROVIDER-LEVEL VERIFICATION** for Consumet and Anivexa providers. The pattern is **PROVEN** in AnimeGarden, vibeDebrid, anime-sdk, anime-airing-notify, and RockinChaos, but **MUST BE VERIFIED** against our specific providers (Consumet, Anivexa's 13 providers) before relying on it for idempotent upserts.

**RECOMMENDATION:** Implement Phase 1 with a **verification gate** - the first scan run validates episode ID stability for each provider before enabling idempotent upserts. If unstable, fall back to `(provider, providerAnimeId, providerEpisodeId, airDate?)` composite key.

---

## PHASE 4 COMPLETE — RESEARCH ONLY.

**Awaiting your approval to proceed to Phase 1 implementation.**

---

**END OF PLAN**
