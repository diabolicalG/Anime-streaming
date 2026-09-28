# Phase 4 Audit 1/5: Phase 3 Contracts + Watch Page

**Generated:** 2025-09-14  
**Repository:** /root/anime-streaming  
**Scope:** Read-only audit of Phase 3 contracts and existing Watch Page implementation

---

## 1. PHASE 3 CONTRACT INVENTORY

### 1.1 AniList Service (Frontend)
**File:** `apps/frontend/src/services/anilist.ts`

**Exported API (`anilistApi`):**
| Function | Parameters | Returns |
|----------|------------|---------|
| `search` | `{ search: string; page?: number; perPage?: number }` | `Promise<{ Page: { media: AniListMedia[]; pageInfo: AniListPageInfo } }>` |
| `detail` | `id: number` | `Promise<{ Media: AniListMedia }>` |
| `seasonal` | `(season: string, year: number, page = 1, perPage = 20)` | `Promise<{ Page: { media: AniListMedia[]; pageInfo: AniListPageInfo } }>` |
| `browse` | `{ genre?: string; status?: string; format?: string; season?: string; seasonYear?: number; page?: number; perPage?: number }` | `Promise<{ Page: { media: AniListMedia[]; pageInfo: AniListPageInfo } }>` |
| `recommendations` | `id: number` | `Promise<{ Media: { recommendations: { nodes: Array<{ mediaRecommendation: AniListMedia; rating?: number }> } } }>` |

**GraphQL Client:** `graphql-request` pointing to `VITE_ANILIST_API_URL` or `https://graphql.anilist.co`

**Key Types:**
- `AniListMedia` - Full media object with title, synonyms, coverImage, bannerImage, description, status, format, episodes, duration, season, seasonYear, genres, scores, dates, studios, trailer, recommendations
- `AniListPageInfo` - `{ total, currentPage, lastPage, hasNextPage, perPage }`

### 1.2 AniList Types (Shared)
**File:** `apps/frontend/src/types/streaming.ts` (also duplicated in `apps/frontend/src/types/anilist.ts`)

**Key Types:**
- `AniListMedia` - Same as above
- `AniListPageInfo` - Pagination info
- `AniListSearchResult` - `{ media: AniListMedia[]; pageInfo: AniListPageInfo }`
- `AniListDetailResult` - `{ media: AniListMedia }`
- `AniListSeasonalResult` - `{ media: AniListMedia[]; pageInfo: AniListPageInfo }`
- `AniListBrowseResult` - `{ media: AniListMedia[]; pageInfo: AniListPageInfo }`
- `AniListRecommendationsResult` - `{ recommendations: Array<{ media: AniListMedia; rating?: number }> }`
- Enums: `MediaSeason`, `MediaStatus`, `MediaFormat`

### 1.3 MappingService (Backend)
**File:** `apps/backend/src/services/mapping.ts`

**Exported:** `mappingService` with 3 methods:

| Method | Input | Output |
|--------|-------|--------|
| `resolveProviderId(anilistId: number)` | AniList ID (number) | `Promise<{ providerId: string; providerName: string } \| null>` |
| `invalidateMapping(anilistId: number)` | AniList ID | `Promise<void>` |
| `getMappingStatus(anilistId: number)` | AniList ID | `Promise<any>` (cached mapping entry) |

**Internal Implementation:**
- **Confidence Threshold:** `0.85` (configurable via `PROVIDER_MAPPING_CONFIDENCE_THRESHOLD` env)
- **Scoring Algorithm:**
  - Exact title match: 0.4
  - Levenshtein similarity × 0.3
  - Synonym match: 0.3
  - Year diff 0: 0.15, diff 1: 0.1
  - Format match: 0.1
  - Episode diff 0: 0.05, diff ≤2: 0.03
  - Season match: 0.05
  - **Max score: 1.0**
- **OVERRIDE_MAP:** Empty `Record<number, { providerId, providerName }>` for manual overrides
- **Provider Identification:** Tries each provider's `getAnimeInfo()`, falls back to ID pattern (`gogoanime` → `consumet`, else `anivexa`)
- **Caching:**
  - Success: 7 days (`MAPPING` TTL), includes `score`, `resolvedAt`
  - Failure: 1 hour (`MAPPING_UNRESOLVED` TTL), `providerId: ''`, `providerName: 'consumet'`
- **Cache Key:** `mapping:anilist:{anilistId}` in `mapping:anilist` namespace

### 1.4 ProviderRegistry (Backend)
**File:** `apps/backend/src/services/streaming/index.ts`

**Exported:** `providerRegistry` (singleton instance)

**Class: `ProviderRegistry`**
| Method | Description |
|--------|-------------|
| `initialize()` | Lazy initialization of providers |
| `getProvider(name: ProviderName)` | Get specific provider |
| `getAllProviders()` | Returns `[ConsumetProvider, AnivexaProvider]` sorted by priority |
| `getBestProvider()` | Returns first healthy provider |
| `searchWithFallback(query, page)` | Tries providers in priority order, caches 6h |
| `getAnimeInfoWithFallback(providerId)` | **Handles AniList ID resolution** - detects numeric IDs, calls MappingService, recurses with resolved providerId |
| `getEpisodeSourcesWithFallback(providerId, episode)` | **Handles AniList ID resolution** - same detection logic, recurses with resolved providerId |

**Provider Order (Priority):**
1. `ConsumetProvider` (priority=1) - supports Dub + Sub
2. `AnivexaProvider` (priority=2) - supports Sub only

**Circuit Breaker Integration:** All provider calls wrapped via `providerCircuitBreakers`

**Cache Namespaces:** `search`, `anime`, `episode` with TTLs (6h, 1h, 6h)

### 1.5 Provider Contracts (Backend)
**File:** `apps/backend/src/services/streaming/Provider.ts`

**Interface: `StreamingProvider`**
```typescript
interface StreamingProvider {
  readonly name: string;
  readonly baseUrl: string;
  readonly priority: number;
  readonly supportsDub: boolean;
  readonly supportsSub: boolean;
  search(query: string, page?: number): Promise<ProviderSearchResult[]>;
  getAnimeInfo(providerId: string): Promise<ProviderDetail>;
  getEpisodeSources(providerId: string, episode: number): Promise<StreamSource[]>;
  healthCheck(): Promise<boolean>;
}
```

**Types:**
- `StreamSource`: `{ url, quality, isM3U8, headers?, subtitles?, referrer? }`
- `SubtitleTrack`: `{ url, lang, label, default? }`
- `ProviderSearchResult`: `{ id, title, image?, type, episodes?, status? }`
- `ProviderDetail`: `{ id, title, synonyms, image, cover?, description, type, status, episodes, genres, season?, year?, episodesList: EpisodeInfo[] }`
- `EpisodeInfo`: `{ number, title?, filler?, sources: StreamSource[] }`

### 1.6 ConsumetProvider (Backend)
**File:** `apps/backend/src/services/streaming/ConsumetProvider.ts`

**Base URL:** `https://api.consumet.org` (configurable via env)

**Endpoints Used:**
- `GET /anime/gogoanime/search?query={query}&page={page}`
- `GET /anime/gogoanime/info/{providerId}`
- `GET /anime/gogoanime/watch?episodeId={providerId}-episode-{episode}`

**Episode ID Format:** `{providerId}-episode-{episodeNumber}`

**Subtitle Mapping:** `lang` → `label: lang.toUpperCase()`

### 1.7 AnivexaProvider (Backend)
**File:** `apps/backend/src/services/streaming/AnivexaProvider.ts`

**Base URL:** `https://api.anivexa.com` (configurable via env)

**Endpoints Used:**
- `GET /search?q={query}&page={page}`
- `GET /anime/{providerId}`
- `GET /episode/{providerId}-ep-{episode}`

**Episode ID Format:** `{providerId}-ep-{episodeNumber}`

**Subtitle Mapping:** `lang` → `label: lang.toUpperCase()`

### 1.8 CircuitBreaker (Backend)
**File:** `apps/backend/src/services/streaming/CircuitBreaker.ts`

**Library:** `opossum`

**Configuration:**
- Timeout: 10s
- Error Threshold: 50%
- Reset Timeout: 30s
- Volume Threshold: 10

**Breakers per Provider per Operation:**
- `search:{providerName}`
- `animeInfo:{providerName}`
- `episodeSources:{providerName}`

**Events Logged:** open, close, halfOpen, fallback, failure

### 1.9 Backend API Routes
**File:** `apps/backend/src/routes/anime.ts`

**AniList Routes (relevant to Phase 4):**

| Route | Method | Validation | Controller |
|-------|--------|------------|------------|
| `/anilist/:id/episodes/:episode/sources` | GET | `anilistEpisodeSchema` (id: positive int, episode: positive int) | `getAnilistEpisodeSources` |
| `/anilist/:id/resolve` | GET | `anilistIdSchema` (id: positive int) | `resolveProviderId` |

**Response Shape (Success):**
```json
{ "success": true, "data": StreamSource[] }
```

**Response Shape (Error):**
```json
{ "success": false, "error": { "code": string, "message": string } }
```
- 400: `VALIDATION_ERROR` (invalid ID/episode)
- 404: `NO_SOURCES` (no playable sources)

### 1.10 Frontend API Hooks
**File:** `apps/frontend/src/hooks/useAnime.ts`

**Relevant Hooks:**
- `useAnimeDetail(anilistId)` → returns AniListMedia
- `useRecommendations(anilistId)` → returns AniListMedia[] with `recommendationRating`
- `useInfiniteAnimeSearch(query)` → infinite pagination
- `useInfiniteSeasonal(season, year)` → infinite pagination
- `useInfiniteBrowse(filters)` → infinite pagination

### 1.11 Frontend Types (Streaming)
**File:** `apps/frontend/src/types/streaming.ts`

**Key Types:**
- `StreamSource`: `{ url, quality, isM3U8, headers?, subtitles?, referrer? }`
- `SubtitleTrack`: `{ url, lang, label, default? }`
- `Episode`: `{ number, title?, filler?, sources? }`
- `AnimeInfo`: Provider detail shape
- `AniListMedia`: Full AniList media object

### 1.12 Frontend State (Player Store)
**File:** `apps/frontend/src/store/usePlayerStore.ts`

**State:**
- `sources: StreamSource[]`
- `currentSource: StreamSource | null`
- `subtitles: SubtitleTrack[]`
- `currentSubtitle: SubtitleTrack | null`
- `quality: string` (default: 'auto')
- `isPlaying: boolean`
- `volume: number` (default: 1)
- `playbackRate: number` (default: 1)
- `currentTime: number`
- `duration: number`
- `fullscreen: boolean`
- `pip: boolean`

**Actions:**
- `setSources(sources)` - sets sources + auto-selects first
- `selectSource(source)` - sets currentSource + quality
- `selectSubtitle(subtitle)` - sets currentSubtitle
- `setQuality`, `setPlaying`, `setVolume`, `setPlaybackRate`, `setCurrentTime`, `setDuration`
- `toggleFullscreen`, `togglePip`, `reset`

---

## 2. WATCH PAGE AUDIT

### 2.1 Route Definition
**File:** `apps/frontend/src/App.tsx`
```tsx
<Route path="watch/:anilistId/:episode" element={<WatchPage />} />
```
**Route Parameters:**
- `anilistId` - string (AniList numeric ID)
- `episode` - string (episode number)

### 2.2 WatchPage Implementation
**File:** `apps/frontend/src/pages/WatchPage.tsx`

**Parameter Handling:**
```typescript
const { anilistId, episode } = useParams<{ anilistId: string; episode: string }>();
const epNum = parseInt(episode || '1', 10);
const animeIdNum = parseInt(anilistId || '0', 10);
```

**Source Fetching:**
```typescript
const { data, isLoading, error } = useQuery({
  queryKey: ['episodeSources', 'anilist', animeIdNum, epNum],
  queryFn: async () => {
    const { data } = await api.get<{ success: boolean; data: StreamSource[] }>(
      `/api/anime/anilist/${animeIdNum}/episodes/${epNum}/sources`
    );
    return data.data;
  },
  enabled: !!anilistId && !!epNum && animeIdNum > 0,
});
```

**State Management:**
- Local `sources` state (mirror of query data)
- Uses `usePlayerStore` for `currentSource`, `selectSource`, `subtitles`, `currentSubtitle`, `selectSubtitle`
- Syncs query data → player store via `useEffect`

**Loading State:**
- Full-screen spinner with "Loading stream..."

**Error State:**
- "Unable to Load Stream" card with "No playable sources found for this episode"
- Link back to home

**Player Integration:**
```tsx
<VideoPlayer
  source={currentSource}
  subtitles={subtitles}
  onEnded={() => console.log('Episode ended')}
/>
```

**Quality Selector:**
- `<select>` bound to `currentSource?.quality || 'auto'`
- Options from `sources.map(s => s.quality)`
- On change: `selectSource(source)`

**Subtitle Selector:**
- Shows when `subtitles.length > 0`
- Options from `subtitles.map(s => s.label)`
- On change: `selectSubtitle(sub || null)`

### 2.3 AnimeDetailPage → WatchPage Flow
**AnimeDetailPage** (`apps/frontend/src/pages/AnimeDetailPage.tsx`):
- Has embedded player (modal) for inline watching
- Episode selection via button grid
- `handleEpisodeSelect(episode)` → sets `selectedEpisode` + `showPlayer=true`
- Fetches sources via same API endpoint
- "Play from Beginning" buttons call `handleEpisodeSelect(1)`

**Navigation to WatchPage:**
- No direct link from AnimeDetailPage to WatchPage route
- WatchPage is standalone route for direct episode access

### 2.4 Reusable Components
- `VideoPlayer` - Video.js + HLS.js wrapper with HLS, subtitles, quality switching
- `usePlayerStore` - Global player state (Zustand)
- `api` - Axios instance with auth interceptors

### 2.5 Assumptions & Limitations
| Aspect | Current Behavior |
|--------|-----------------|
| Episode numbering | 1-based, no special episode handling |
| Episode validation | Only positive integer check |
| Missing episode | Returns empty sources → 404 error |
| Invalid episode | Zod validation → 400 error |
| Provider episode mapping | None - passes episode number directly to provider |
| Season handling | Not implemented in episode sources |
| Episode transitions | Manual via quality/subtitle selectors only |
| Auto-next episode | Not implemented |
| Episode metadata (title, filler) | Not fetched for WatchPage |

---

## 3. ANILIST / EPISODE IDENTITY

### 3.1 AniList ID Format
- **Type:** Positive integer (`z.coerce.number().int().positive()`)
- **Validation:** Both frontend (parseInt) and backend (Zod)
- **Range:** No explicit max, but AniList IDs are ~1-150000

### 3.2 Episode Numbering
- **Type:** Positive integer (`z.coerce.number().int().positive()`)
- **Default:** Episode 1 (in WatchPage fallback)
- **Validation:** Frontend parseInt + backend Zod
- **Max:** No explicit max, limited by anime's episode count

### 3.3 Season Handling
- **Not implemented** in episode source resolution
- Providers receive raw episode number
- No season/arc differentiation

### 3.4 Provider Episode Mapping
| Provider | Episode ID Format |
|----------|------------------|
| Consumet | `{providerId}-episode-{episode}` |
| Anivexa | `{providerId}-ep-{episode}` |

**Risk:** Provider IDs may not align with simple numeric episode numbers. Both providers construct episode IDs from their own provider ID + episode number.

### 3.5 Special Episodes
- **Not supported** - no special/OVA/bonus episode handling
- Filler detection exists in ConsumetProvider but not exposed to WatchPage

### 3.6 Missing Episode Behavior
- Backend: Returns empty array → 404 `NO_SOURCES`
- Frontend: Shows "Unable to Load Stream" error

### 3.7 Invalid Episode Behavior
- Frontend: `parseInt` with fallback to 1
- Backend: Zod validation → 400 `VALIDATION_ERROR`

### 3.8 Episode Transitions
- **No automatic transitions** - episode ended only logs to console
- **No next/previous episode controls** in WatchPage
- AnimeDetailPage has episode grid but no keyboard navigation

### 3.9 Ambiguities & Risks
1. **Episode ID mismatch risk:** Provider episode ID format assumes provider ID matches the mapped provider ID. If MappingService returns a provider ID that doesn't match the provider's internal ID scheme, episode fetching will fail.
2. **No episode metadata:** WatchPage doesn't fetch/show episode titles, thumbnails, or filler status.
3. **No cross-season episode handling:** For split-cour shows, episode numbers may reset per season.
4. **Direct provider ID dependency:** The entire flow depends on MappingService returning a provider ID that the provider's `getEpisodeSources` can use directly.

---

## 4. API CONTRACTS

### 4.1 GET /api/anime/anilist/:id/episodes/:episode/sources

**Route:** `apps/backend/src/routes/anime.ts:78`
**Controller:** `animeController.getAnilistEpisodeSources`

**Parameters:**
- `id` (path): AniList ID - positive integer
- `episode` (path): Episode number - positive integer

**Validation:** `anilistEpisodeSchema` (Zod)
```typescript
params: z.object({
  id: z.coerce.number().int().positive(),
  episode: z.coerce.number().int().positive(),
})
```

**Service Call:**
```typescript
const sources = await providerRegistry.getEpisodeSourcesWithFallback(anilistId.toString(), epNum);
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "url": "https://...",
      "quality": "1080p",
      "isM3U8": true,
      "headers": { "Referer": "..." },
      "subtitles": [
        { "url": "https://...", "lang": "en", "label": "EN" }
      ],
      "referrer": "https://..."
    }
  ]
}
```

**Response (400):**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Invalid AniList ID or episode number" }
}
```

**Response (404):**
```json
{
  "success": false,
  "error": { "code": "NO_SOURCES", "message": "No playable sources found for this episode" }
}
```

### 4.2 GET /api/anime/anilist/:id/resolve

**Route:** `apps/backend/src/routes/anime.ts:79`
**Controller:** `animeController.resolveProviderId`

**Parameters:**
- `id` (path): AniList ID - positive integer

**Validation:** `anilistIdSchema`
```typescript
params: z.object({
  id: z.coerce.number().int().positive(),
})
```

**Service Call:**
```typescript
const resolved = await mappingService.resolveProviderId(anilistId);
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "providerId": "gogoanime:12345",
    "providerName": "consumet"
  }
}
```

**Response (404):**
```json
{
  "success": false,
  "error": { "code": "NOT_FOUND", "message": "Could not resolve provider for this AniList ID" }
}
```

---

## 5. MAPPING SERVICE COMPATIBILITY

### 5.1 Inputs
- `anilistId: number` - AniList media ID

### 5.2 Outputs
- **Success:** `{ providerId: string; providerName: string }`
- **Failure/No Match:** `null`

### 5.3 Confidence Scoring
| Factor | Weight | Details |
|--------|--------|---------|
| Exact title match | 0.4 | romaji/english/native/synonyms exact match |
| Fuzzy title match | 0.3 | Levenshtein similarity × 0.3 |
| Synonym match | 0.3 | Provider title matches any synonym |
| Year match | 0.15/0.1 | Exact: 0.15, Off-by-1: 0.1 |
| Format match | 0.1 | Exact format match |
| Episode count | 0.05/0.03 | Exact: 0.05, Within 2: 0.03 |
| Season match | 0.05 | Season name match |

**Threshold:** 0.85 (configurable)

### 5.4 Provider Identity
- Determined by calling each provider's `getAnimeInfo(providerId)`
- Returns provider's `name` property (`'consumet'` or `'anivexa'`)
- Fallback: ID pattern detection (`gogoanime` → `consumet`, else `anivexa`)

### 5.5 Caching
| Cache Type | TTL | Key Format | Namespace |
|------------|-----|------------|-----------|
| Success | 7 days | `mapping:anilist:{anilistId}` | `mapping:anilist` |
| Failure | 1 hour | `mapping:anilist:{anilistId}` | `mapping:anilist` |

**Cached Data (Success):**
```typescript
{
  providerId: string,
  providerName: string,
  score: number,
  resolvedAt: string (ISO date)
}
```

**Cached Data (Failure):**
```typescript
{
  providerId: '',
  providerName: 'consumet',
  score: 0,
  resolvedAt: string
}
```

### 5.6 Failures
- AniList detail fetch failure → returns `null` (no cache)
- No provider matches above threshold → caches failure, returns `null`
- Provider search failures → logged, continues with other providers

### 5.7 Overrides
- `OVERRIDE_MAP: Record<number, { providerId, providerName }>` - empty by default
- Checked before any provider search
- If override exists, caches with 7-day TTL and returns immediately

### 5.8 Invalidation
- `invalidateMapping(anilistId)` - deletes cache key
- `getMappingStatus(anilistId)` - returns cached entry (or null)

### 5.9 Error Behavior
- Never throws - returns `null` on any failure
- Logs warnings for AniList fetch failures and provider search failures

---

## 6. PROVIDER REGISTRY

### 6.1 ProviderRegistry API
**Singleton:** `providerRegistry` exported from `apps/backend/src/services/streaming/index.ts`

**Methods:**
| Method | Signature | Notes |
|--------|-----------|-------|
| `searchWithFallback` | `(query: string, page?: number) => Promise<ProviderSearchResult[]>` | Caches 6h, tries providers in priority order |
| `getAnimeInfoWithFallback` | `(providerId: string) => Promise<ProviderDetail>` | **Handles AniList IDs**, caches 1h |
| `getEpisodeSourcesWithFallback` | `(providerId: string, episode: number) => Promise<StreamSource[]>` | **Handles AniList IDs**, caches 6h |
| `getProvider` | `(name: ProviderName) => ProviderInstance \| undefined` | Direct access |
| `getAllProviders` | `() => ProviderInstance[]` | Sorted by priority |
| `getBestProvider` | `() => Promise<ProviderInstance \| null>` | First healthy |

### 6.2 Provider Identification
- **AniList ID Detection:** `/^\d+$/.test(providerId) && !providerId.startsWith('gogoanime') && !providerId.startsWith('anivexa')`
- **Resolution:** Calls `mappingService.resolveProviderId(anilistId)`
- **Recursion:** Re-calls same method with resolved `providerId`

### 6.3 Provider Lookup
- `getProvider(name)` - returns specific provider instance
- `getAllProviders()` - returns `[ConsumetProvider, AnivexaProvider]` (priority sorted)

### 6.4 Provider Ordering
1. **ConsumetProvider** (priority=1) - Dub + Sub
2. **AnivexaProvider** (priority=2) - Sub only

### 6.5 Provider Contracts
All providers implement `StreamingProvider` interface:
```typescript
interface StreamingProvider {
  readonly name: string;
  readonly baseUrl: string;
  readonly priority: number;
  readonly supportsDub: boolean;
  readonly supportsSub: boolean;
  search(query: string, page?: number): Promise<ProviderSearchResult[]>;
  getAnimeInfo(providerId: string): Promise<ProviderDetail>;
  getEpisodeSources(providerId: string, episode: number): Promise<StreamSource[]>;
  healthCheck(): Promise<boolean>;
}
```

### 6.6 Provider Result Types
- `ProviderSearchResult[]` - search results
- `ProviderDetail` - anime info with episodesList
- `StreamSource[]` - playable sources with quality, subtitles

---

## 7. PRESERVATION REQUIREMENTS

Phase 4 **MUST** preserve the following contracts unchanged:

### 7.1 API Response Shapes
- `GET /api/anime/anilist/:id/episodes/:episode/sources` → `{ success: true, data: StreamSource[] }`
- `GET /api/anime/anilist/:id/resolve` → `{ success: true, data: { providerId, providerName } }`
- Error format: `{ success: false, error: { code, message } }`

### 7.2 AniList Contracts
- `AniListMedia` type structure (all fields)
- `AniListPageInfo` pagination
- GraphQL query fragments and variables

### 7.3 Episode Identity
- AniList ID: positive integer
- Episode: positive integer (1-based)
- Route params: `anilistId` (string), `episode` (string)

### 7.4 MappingService
- Single exported `mappingService` with 3 methods
- `resolveProviderId(anilistId)` → `{ providerId, providerName } | null`
- Confidence threshold 0.85 (env-configurable)
- 7-day success cache / 1-hour failure cache
- OVERRIDE_MAP mechanism

### 7.5 ProviderRegistry
- Singleton `providerRegistry` export
- `getEpisodeSourcesWithFallback(providerId, episode)` - handles AniList IDs
- Priority order: Consumet → Anivexa
- CircuitBreaker wrapping on all calls

### 7.6 Provider Contracts
- `StreamingProvider` interface unchanged
- `StreamSource`, `SubtitleTrack`, `ProviderDetail`, `ProviderSearchResult` types
- ConsumetProvider & AnivexaProvider implementations

### 7.7 CircuitBreaker
- Per-provider per-operation breakers
- Current configuration (timeout 10s, threshold 50%, reset 30s)
- Event logging (open/close/halfOpen/fallback/failure)

### 7.8 Cache Behavior
- Redis-backed `CacheService` with prefix namespaces
- TTLs as defined in `CACHE_TTL` constant
- Graceful error handling (warn, return null/continue)

### 7.9 Frontend Contracts
- `useAnimeDetail`, `useRecommendations` hooks
- `usePlayerStore` state shape and actions
- `VideoPlayer` props: `{ source, subtitles, onReady, onError, onEnded, onTimeUpdate }`
- `api` axios instance with auth interceptors

---

## 8. BLOCKERS

### 8.1 Blocking Compatibility Issues
| Issue | Description | Impact |
|-------|-------------|--------|
| **Provider Episode ID Format Coupling** | ProviderRegistry passes episode number directly to provider's `getEpisodeSources(providerId, episode)`. Providers construct episode IDs as `{providerId}-episode-{episode}` (Consumet) or `{providerId}-ep-{episode}` (Anivexa). If MappingService returns a provider ID that doesn't match the provider's expected format, episode fetching will fail silently (empty sources). | HIGH - Core streaming flow depends on this working |
| **No Episode Metadata in WatchPage** | WatchPage only receives `StreamSource[]` - no episode title, thumbnail, filler status, or season context. | MEDIUM - Limits UI richness |
| **No Cross-Season Episode Handling** | For split-cour shows (e.g., "Part 1" / "Part 2"), episode numbers may reset. Current flow assumes continuous 1..N numbering. | MEDIUM - May break for split-cour anime |
| **Direct Provider ID Dependency** | Entire AniList → Provider flow assumes MappingService returns a provider ID that the target provider's `getEpisodeSources` accepts directly. No translation layer exists. | HIGH - Architectural assumption |

### 8.2 Non-Blocking Issues
| Issue | Description |
|-------|-------------|
| Duplicate AniList Types | `AniListMedia` defined in both `apps/frontend/src/types/streaming.ts` and `apps/frontend/src/types/anilist.ts` |
| No Episode Navigation in WatchPage | No next/previous episode buttons, no keyboard shortcuts |
| No Auto-Next Episode | `onEnded` only logs to console |
| No Special Episode Support | OVA/special episodes not handled differently |
| No Episode Progress Persistence | `currentTime` in store but not persisted across sessions |
| Missing Error Recovery | No retry button on stream load failure |

### 8.3 Ambiguities
| Ambiguity | Details |
|-----------|---------|
| Provider ID Format | What exact format does MappingService return? `gogoanime:12345`? Raw provider ID? |
| Episode 0 / Specials | How should episode 0 or special episodes be handled? |
| Dub/Sub Selection | Consumet supports dub, Anivexa doesn't - no UI for language selection |
| Subtitle Language Negotiation | No logic for preferred subtitle language |

### 8.4 Missing Contracts
| Missing | Needed For |
|---------|------------|
| Episode metadata API | Episode titles, thumbnails, filler status in WatchPage |
| Episode navigation API | Next/previous episode, episode list with metadata |
| Provider episode mapping | Translation between AniList episode numbers and provider episode IDs |
| Stream quality adaptation | Automatic quality switching based on bandwidth |
| Offline/download support | Not in current architecture |

---

## PHASE 4 AUDIT 1 STATUS

**Blocking Issues:**
1. Provider Episode ID Format Coupling - Core streaming flow assumes provider ID format compatibility without translation layer
2. Direct Provider ID Dependency - MappingService output must be directly usable by provider's episode sources endpoint

**Non-Blocking Issues:**
1. Duplicate AniList type definitions in frontend
2. No episode navigation controls in WatchPage
3. No auto-next episode functionality
4. No special/OVA episode handling
5. No episode progress persistence
6. No stream load retry mechanism

**Contracts Phase 4 MUST Preserve:**
1. API response shapes for `/api/anime/anilist/:id/episodes/:episode/sources` and `/api/anime/anilist/:id/resolve`
2. AniList type contracts (`AniListMedia`, `AniListPageInfo`, etc.)
3. Episode identity (AniList ID: positive int, Episode: positive int)
4. MappingService interface (3 methods, confidence scoring, caching, overrides)
5. ProviderRegistry singleton and AniList ID resolution logic
6. StreamingProvider interface and both provider implementations
7. CircuitBreaker per-provider per-operation wrapping
8. Cache namespaces and TTLs
9. Frontend hooks (`useAnimeDetail`, `useRecommendations`)
10. usePlayerStore state shape and actions
11. VideoPlayer component props interface