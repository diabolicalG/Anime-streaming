# Phase 4 Implementation Plan

**Repository:** `/root/anime-streaming`  
**Status:** READ-ONLY / PLAN MODE  
**Generated:** 2025-09-16  
**Phases 1-3:** FROZEN / UNMODIFIED  

---

## Executive Summary

This plan is derived from actual repository inspection. Phase 4 adds a **thin consumer layer** over frozen Phases 1-3 infrastructure:
- **StreamResolver** (new): normalizes/classifies ProviderRegistry candidates
- **Player/HLS** (enhance): destroy-before-replace, quality switching, error recovery
- **WatchPage** (enhance): episode rail, Canva Obsidian Black UI, controls
- **Episode Navigation** (new): prev/next, keyboard, auto-next (respects prefs)
- **Watch History** (integrate): backend endpoint + frontend auto-save/resume
- **Subtitle/Audio** (enhance): in-manifest VTT, offset, language negotiation
- **Mobile UX** (enhance): touch, PiP, orientation, capability detection

**No new providers, no new registries, no schema changes, no duplicate systems.**

---

## File Classification Audit

### Backend - Streaming Services (`apps/backend/src/services/streaming/`)

| File | Classification | Reason |
|------|---------------|--------|
| `Provider.ts` | **FROZEN - NEVER MODIFY** | Core interface: `StreamingProvider`, `StreamSource`, `SubtitleTrack`, `ProviderSearchResult`, `ProviderDetail`, `EpisodeInfo` |
| `ConsumetProvider.ts` | **FROZEN - NEVER MODIFY** | Phase 3 provider implementation |
| `AnivexaProvider.ts` | **FROZEN - NEVER MODIFY** | Phase 3 provider implementation |
| `CircuitBreaker.ts` | **FROZEN - NEVER MODIFY** | Phase 3 circuit breakers (opossum) |
| `index.ts` | **FROZEN - NEVER MODIFY** | `ProviderRegistry` singleton with `getEpisodeSourcesWithFallback`, `getAnimeInfoWithFallback`, `searchWithFallback` |

### Backend - Mapping & Cache (`apps/backend/src/services/`)

| File | Classification | Reason |
|------|---------------|--------|
| `mapping.ts` | **FROZEN - NEVER MODIFY** | `MappingService`: `resolveProviderId`, `invalidateMapping`, `getMappingStatus` |
| `cache.ts` | **FROZEN - NEVER MODIFY** | `CacheService`, namespaces, TTLs |
| `anilist.ts` | **FROZEN - NEVER MODIFY** | AniList GraphQL client |

### Backend - Sync/Worker (`apps/backend/src/services/sync/`)

| File | Classification | Reason |
|------|---------------|--------|
| `SyncOrchestrator.ts` | **FROZEN - NEVER MODIFY** | Phase 2 sync, availability checks |
| `AvailabilityPipeline.ts` | **FROZEN - NEVER MODIFY** | Phase 2 availability |
| `SyncScheduler.ts` | **FROZEN - NEVER MODIFY** | Phase 2 scheduler |
| `Worker.ts` | **FROZEN - NEVER MODIFY** | Phase 2 worker |
| `adapters/*` | **FROZEN - NEVER MODIFY** | Phase 2 sync adapters |

### Backend - Discovery (`apps/backend/src/services/discovery/`)

| File | Classification | Reason |
|------|---------------|--------|
| All files | **FROZEN - NEVER MODIFY** | Phase 1 discovery infrastructure |

### Backend - Controllers & Routes

| File | Classification | Reason |
|------|---------------|--------|
| `controllers/animeController.ts` | **EXISTING - MODIFY LATER** | Delegates `/sources` to StreamResolver (4.2), add `/meta` only if necessary (4.5) |
| `routes/anime.ts` | **EXISTING - MODIFY LATER** | Preserve `/sources` contract exactly; add `/meta` route only if needed |
| `routes.ts` | **FROZEN - NEVER MODIFY** | Core router, mount points unchanged |
| `routes/sync.ts` | **FROZEN - NEVER MODIFY** | Phase 2 sync routes |

### Backend - Database

| File | Classification | Reason |
|------|---------------|--------|
| `prisma/schema.prisma` | **FROZEN - NEVER MODIFY** | `WatchHistory`, `UserPreferences`, `Anime`, `Episode`, `DiscoveredRelease`, `SyncJob` - no schema changes |

### Frontend - Player (`apps/frontend/src/components/player/`)

| File | Classification | Reason |
|------|---------------|--------|
| `VideoPlayer.tsx` | **EXISTING - MODIFY LATER** | Enhance: destroy-before-replace, quality switching, error recovery, HLS lifecycle, PiP |
| `useHls.ts` | **EXISTING - MODIFY LATER** | Enhance: proper cleanup, event listeners |

### Frontend - Components (New for Phase 4)

| File | Classification | Reason |
|------|---------------|--------|
| `components/watch/EpisodeRail.tsx` | **CONFIRMED NEW** | Collapsible episode sidebar with progress, season grouping (4.5) |
| `components/watch/QualitySelector.tsx` | **CONFIRMED NEW** | Quality pills with bitrate labels, capability-based (4.5) |
| `components/watch/SubtitleMenu.tsx` | **CONFIRMED NEW** | Language menu, offset slider, CSS customization (4.8) |
| `components/watch/SourceSelector.tsx` | **CONFIRMED NEW** | Source badges (provider, quality), retry on error (4.5) |
| `components/watch/ResumePrompt.tsx` | **CONFIRMED NEW** | Resume/restart dialog on episode load (4.7) |
| `components/watch/AutoNextOverlay.tsx` | **CONFIRMED NEW** | Countdown + next button, respects `autoPlayNext` pref (4.6) |
| `components/player/PlayerErrorBoundary.tsx` | **CONFIRMED NEW** | Error boundary with retry/select source (4.4) |

### Frontend - Hooks (New for Phase 4)

| File | Classification | Reason |
|------|---------------|--------|
| `hooks/useStreamResolution.ts` | **CONFIRMED NEW** | Frontend stream resolution, source selection, fallback (4.2-4.3) |
| `hooks/useWatchHistory.ts` | **CONFIRMED NEW** | Auto-save position, resume prompt, uses existing API (4.7) |
| `hooks/useEpisodeNavigation.ts` | **CONFIRMED NEW** | Prev/next, keyboard, auto-next, URL sync (4.6) |
| `hooks/useMobilePlayer.ts` | **CONFIRMED NEW** | Touch gestures, PiP, orientation, capability detection (4.9) |

### Frontend - Pages & Store

| File | Classification | Reason |
|------|---------------|--------|
| `pages/WatchPage.tsx` | **EXISTING - MODIFY LATER** | Integrate EpisodeRail, enhanced controls, error boundary (4.5) |
| `pages/AnimeDetailPage.tsx` | **EXISTING - MODIFY LATER** | Sync episode selection with WatchPage, share player logic (4.5) |
| `store/usePlayerStore.ts` | **EXISTING - MODIFY LATER** | Extend: `resumePosition`, `preferredQuality`, `autoNextEnabled` (4.7) |
| `hooks/useStream.ts` | **EXISTING - MODIFY LATER** | Add `useEpisodeSources` for AniList ID pattern (already exists) |

### Frontend - Types

| File | Classification | Reason |
|------|---------------|--------|
| `types/streaming.ts` | **EXISTING - MODIFY LATER** | Add internal `NormalizedStreamSource`, `StreamResolutionError` - **preserve `StreamSource`, `SubtitleTrack` exactly** |
| `types/anilist.ts` | **FROZEN - NEVER MODIFY** | AniList types - leave duplicates alone per scope rule |

---

## Verification of Key Audit Requirements

### 1. WatchHistory Frontend/Backend Contract
- **Frontend hook exists:** `hooks/useStream.ts` -> `useWatchHistory(animeId)` calls `POST /api/user/history` with `{ animeId, episode, position, completed }`
- **Backend endpoint: MISSING** - No `/api/user/history` route, no controller
- **Prisma model exists:** `WatchHistory` with `userId`, `animeId`, `episodeNumber`, `progress`, `completed`, `watchedAt`
- **UserPreferences exists:** `subtitleLang`, `videoQuality`, `autoPlayNext`, `skipIntro`
- **Action needed:** Implement backend `POST /api/user/history` in Phase 4.7 (minimal, reuses model)

### 2. Existing `/sources` API Contract
- **Route:** `GET /api/anime/anilist/:id/episodes/:episode/sources`
- **Response:** `{ success: true, data: StreamSource[] }`
- **Errors:** `400 VALIDATION_ERROR`, `404 NO_SOURCES`
- **Must preserve exactly** - no changes to response shape

### 3. ProviderRegistry/Provider Source Flow
```
GET /sources (anilistId, episode)
  -> animeController.getAnilistEpisodeSources()
  -> providerRegistry.getEpisodeSourcesWithFallback(anilistId.toString(), episode)
  -> Detects numeric AniList ID -> MappingService.resolveProviderId(anilistId)
  -> Recurses with resolved providerId
  -> Tries ConsumetProvider (priority=1) -> AnivexaProvider (priority=2)
  -> CircuitBreaker wraps each call
  -> Caches 6h (episode namespace)
```
- **Phase 4 consumes this flow** - StreamResolver wraps the final `StreamSource[]`

### 4. Player/HLS Implementation
- **VideoPlayer.tsx:** Video.js + HLS.js, native HLS fallback for Safari
- **Config:** `enableWorker: true`, `lowLatencyMode: true`, `startLevel: -1`
- **Teardown:** `hls.destroy()`, `player.dispose()` in cleanup
- **Source switching:** `useEffect` on `source` prop -> `hls.loadSource()` or `player.src()`
- **Subtitles:** `player.addRemoteTextTrack()` for each `SubtitleTrack`
- **Gaps:** No quality level exposure, no `recoverMediaError()`, no destroy-before-replace guarantee on rapid source change, no error boundary

### 5. Episode/AniList Data & Navigation
- **WatchPage:** No episode rail, no prev/next, no keyboard, `onEnded` only logs
- **AnimeDetailPage:** Episode grid (1..N), modal player, "Play from Beginning"
- **AniList data:** `anime.episodes` (total), `anime.season`, `anime.seasonYear` available
- **Episode metadata:** Synced Episode model has `title`, `isFiller`, `isRecap`, `airDate` - but not exposed to WatchPage

### 6. Subtitle/Audio/Quality Handling
- **StreamSource:** `quality` (string like "1080p"), `isM3U8`, `subtitles: SubtitleTrack[]`
- **SubtitleTrack:** `url`, `lang`, `label`, `default?`
- **Providers return:** Consumet/Anivexa both map `lang` -> `label: lang.toUpperCase()`
- **No in-manifest WebVTT parsing** - only side-car URLs
- **No audio track selection** - Consumet supports dub but not exposed

### 7. Mobile/Player Behavior
- **Responsive CSS only** - basic breakpoints
- **No touch gestures**, no swipe seek, no orientation handling
- **PiP button exists** but manual only
- **No capability detection** for HLS/native/quality

---

## Phase 4 Step Dependencies

```
4.1 Integration Boundaries (audit)
  |
  +-> 4.2 Stream Resolution/Normalization
  |     |
  |     +-> 4.3 Playback Selection/Fallback
  |     |     |
  |     |     +-> 4.4 Player/HLS
  |     |     |     |
  |     |     |     +-> 4.5 Watch Page + Canva UI
  |     |     |     |     |
  |     |     |     |     +-> 4.6 Episode Navigation
  |     |     |     |     |
  |     |     |     |     +-> 4.7 Watch History/Resume
  |     |     |     |     |
  |     |     |     |     +-> 4.8 Subtitle/Audio
  |     |     |     |     |
  |     |     |     |     +-> 4.9 Mobile UX
  |     |     |     |
  |     |     |     +-> 4.10 Reliability/Performance
  |     |     |
  |     |     +-> (depends on 4.2)
  |     |
  |     +-> (depends on 4.1)
  |
  +-> (audit complete)
```

**Sequential execution required:** Each step's audit must pass before next step begins.

---

## Corrected Implementation Order

| Step | Phase | Status | Description | Key Files |
|------|-------|--------|-------------|-----------|
| 4.1 | Integration Boundaries | COMPLETE | Document exact integration points; define StreamResolver thin interface | - |
| | | | *Completed as part of baseline commit 867a799. Audit report at docs/audits/phase4/01-phase3-watchpage.md.* | |
| 4.2 | Stream Resolution/Normalization | COMPLETE | Create `StreamResolver`: consume ProviderRegistry -> `NormalizedStreamSource[]`; quality tier classification; error taxonomy; **reuse Phase 3 cache only** | `StreamResolver.ts` (NEW), `StreamResolver.test.ts` (NEW) |
| | | | *Completed in commit 1c2dcb4 (20 tests passing, tsc clean). HLS-before-MP4 sort deferred to 4.10 per plan.* | |
| 4.3 | Playback Selection/Fallback | COMPLETE | Bounded retry/fallback over **actual ProviderRegistry candidates** (max 3, exp backoff); distinguish resolution/source/playback failure | StreamResolver extensions |
| | | | *Completed in commit 1c2dcb4. AbortSignal on both entry points; injectable delay; CIRCUIT_BREAKER_OPEN emitted on opossum OpenCircuitError.* | |
| 4.4 | Player/HLS | Destroy-before-replace; quality switching via `hls.levels`; `recoverMediaError()`; React error boundary; capability-based PiP/quality | `VideoPlayer.tsx` (MODIFY), `PlayerErrorBoundary.tsx` (NEW), `useHls.ts` (MODIFY) |
| 4.5 | Watch Page + Canva UI | EpisodeRail, QualitySelector, SubtitleMenu, SourceSelector, ResumePrompt, AutoNextOverlay; Obsidian Black styles; **no /meta endpoint unless proven necessary** | `WatchPage.tsx` (MODIFY), `EpisodeRail.tsx` (NEW), `QualitySelector.tsx` (NEW), `SubtitleMenu.tsx` (NEW), `SourceSelector.tsx` (NEW), `ResumePrompt.tsx` (NEW), `AutoNextOverlay.tsx` (NEW), `player.css` (NEW) |
| 4.6 | Episode Navigation | Prev/next buttons, keyboard (N/P, arrows), auto-next countdown **respects `autoPlayNext` pref**, skip intro/outro **inactive** (no timing data), URL sync | `useEpisodeNavigation.ts` (NEW), `WatchPage.tsx` (MODIFY) |
| 4.7 | Watch History/Resume | **Implement backend `POST /api/user/history`**; frontend auto-save (debounced 30s + pause/end); resume prompt on load; reuses Prisma `WatchHistory` model | `user.ts` route (NEW), `useWatchHistory.ts` (NEW), `animeController.ts` (MODIFY) |
| 4.8 | Subtitle/Audio | In-manifest WebVTT via `hls.subtitleTracks`; language negotiation via `UserPreferences.subtitleLang`; offset **local/session only**; CSS customization | `useStreamResolution.ts` (MODIFY), `SubtitleMenu.tsx` (NEW), `VideoPlayer.tsx` (MODIFY) |
| 4.9 | Mobile UX | Touch targets (48px), swipe seek (+/-10s), orientation handling, **capability-detected PiP** (no auto), data saver prompt | `useMobilePlayer.ts` (NEW), `VideoPlayer.tsx` (MODIFY) |
| 4.10 | Reliability/Performance | Source selection algorithm (prefer HLS->MP4); **no HEAD probes**; memory leak prevention; short TTL optional (testing-driven) | `StreamResolver.ts` (MODIFY), `VideoPlayer.tsx` (MODIFY) |
| 4.11 | Testing | Unit: normalization, fallback, error taxonomy, HLS lifecycle, subtitle parsing; Integration: provider fallback, episode switch, history resume; E2E: mobile, memory | Test files (NEW) |
| 4.12 | Final Audit | Verify no Phase 1-3 modifications; contracts preserved; benchmarks | - |

---

## Guardrail Compliance Checklist

| Guardrail | Status |
|-----------|--------|
| StreamResolver only consumes ProviderRegistry, normalizes candidates | Confirmed |
| No new providers, no second registry | Confirmed |
| Fallback uses only actual ProviderRegistry candidates | Confirmed |
| Bounded retries, distinguishes failure types | Designed |
| `/sources` contract preserved exactly | Confirmed |
| No `/meta` endpoint unless proven necessary | Deferred |
| WatchHistory: reuse model, implement missing backend endpoint | Designed |
| No Phase 4 stream cache mandatory; reuse Phase 3 cache | Designed |
| No HEAD/pre-playback probes; provider health stays Phase 3 | Confirmed |
| Destroy-before-replace, listener cleanup, safe HLS recovery | Designed |
| SubtitleTrack preserved; offset local/session | Designed |
| isFiller/isRecap not used for intro timing | Confirmed |
| Mobile capability-based, graceful degradation | Designed |
| Canva Obsidian Black UI mapped to components | Designed |
| No unrelated cleanup/refactoring/type consolidation | Confirmed |

---

## Remaining Verification Items (Before Phase 4.1 Start)

| Item | Status | Action |
|------|--------|--------|
| Confirm no existing `/api/user/history` backend route | VERIFIED MISSING | Will implement in 4.7 |
| Confirm Episode metadata (title, isFiller, airDate) not in WatchPage | VERIFIED MISSING | EpisodeRail will fetch from synced Episode data |
| Confirm AniList types duplication is out of scope | VERIFIED | Leave as-is |
| Confirm no existing StreamResolver or equivalent | VERIFIED | None exists |
| Confirm ProviderRegistry has no quality-tier classification | VERIFIED | Raw `StreamSource[]` returned |

---

## Final Gate

PHASE 4 IMPLEMENTATION STATUS: NOT STARTED  
PHASE 4 AUDIT CORRECTIONS: COMPLETE  
FILES MODIFIED: NONE  
PHASE 1 STATUS: FROZEN / UNMODIFIED  
PHASE 2 STATUS: FROZEN / UNMODIFIED  
PHASE 3 STATUS: FROZEN / UNMODIFIED  
AWAITING HUMAN APPROVAL: YES

STOP - Do not implement Phase 4.1. Wait for: "APPROVED - START PHASE 4.1"
