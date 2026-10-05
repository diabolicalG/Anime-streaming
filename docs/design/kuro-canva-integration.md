# Kuro — Obsidian Black Canva Integration

Source design: Canva design ID `DAHW8fZBoMg`
Title: **Kuro — Obsidian Black Anime Streaming UI System · Final Refinement**
Canvas: 1920×1080 presentation, 13 screens
Latest observed update: October 5, 2026

Implemented visual/system mapping:
- Foundation: obsidian background, luminous accent, compact controls, disciplined radii, 8px rhythm.
- Home: featured premiere, Continue Watching, release/trending rails, My List CTA.
- Browse: filter chips, filter controls, responsive card grid, loading/error/no-match/end states.
- Search: live query surface, clear/search controls, results/no-results/retry language.
- Detail: cinematic title hero, metadata chips, episode grid, recommendations, playback overlay.
- Watch: cinematic player frame, source/quality/subtitle controls, episode rail, resume/history.
- History: progress, episode context, resume and removal controls.
- My List: sortable library surface with removal controls.
- Profile: identity, watch-time and taste summary dashboard.
- Settings: Account/security, playback, subtitles/audio, notifications, privacy, devices grouping.
- Auth: calm cinematic sign-in/register treatment.
- Global states/responsive: visible focus, mobile bottom navigation, reduced-motion handling, touch-aware player controls.

Implementation intentionally reuses existing AniList/provider/playback infrastructure and the existing Prisma schema.
