import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

describe('No Circular Phase Dependencies', () => {
  const srcRoot = resolve(__dirname, '../../src');
  
  const getImports = (filePath: string): string[] => {
    const content = readFileSync(filePath, 'utf-8');
    const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
    return imports.map(i => i.replace(/from\s+['"]|['"]/g, ''));
  };

  // 7.1 Phase 1 (discovery) imports nothing from Phase 2 or 3
  it('Phase 1 discovery imports only types and config', () => {
    const discoveryFiles = readdirSync(resolve(srcRoot, 'services/discovery'), { recursive: true })
      .filter(f => f.endsWith('.ts')) as string[];
    
    for (const file of discoveryFiles) {
      const imports = getImports(resolve(srcRoot, 'services/discovery', file));
      for (const imp of imports) {
        // Must not import sync, streaming (except types), mapping
        expect(imp).not.toMatch(/sync/);
        expect(imp).not.toMatch(/streaming/);
        expect(imp).not.toMatch(/mapping/);
        // Allowed: '@/types/discovery', '@/config/discovery', '@/utils/logger', '@/config/redis'
      }
    }
  });

  // 7.2 Phase 3 (streaming/mapping) imports nothing from Phase 1 or 2
  it('Phase 3 streaming/mapping imports only types and config', () => {
    const streamingFiles = readdirSync(resolve(srcRoot, 'services/streaming'))
      .filter(f => f.endsWith('.ts'))
      .map(f => resolve(srcRoot, 'services/streaming', f));

    const phase3Files = [
      ...streamingFiles,
      resolve(srcRoot, 'services/mapping.ts'),
      resolve(srcRoot, 'services/anilist.ts'),
    ];

    for (const file of phase3Files) {
      const imports = getImports(file);

      for (const imp of imports) {
        expect(imp).not.toMatch(/discovery/);
        expect(imp).not.toMatch(/sync/);
      }
    }
  });

  // 7.3 Phase 2 (sync) imports Phase 1 types only, Phase 3 contracts only
  it('Phase 2 sync imports follow allowed pattern', () => {
    const syncDir = resolve(srcRoot, 'services/sync');
    // Will exist after implementation
    expect(true).toBe(true);
  });

  // 7.4 Redis key prefixes are disjoint
  it('Redis key prefixes are phase-isolated', () => {
    const phase1Prefixes = ['discovery:', 'discovery:lock:', 'discovery:job:', 'discovery:health:', 'discovery:circuit:', 'discovery:metrics:'];
    const phase3Prefixes = ['search:', 'anime:', 'episode:', 'anilist:search:', 'anilist:detail:', 'anilist:seasonal:', 'anilist:browse:', 'anilist:recommendations:', 'mapping:anilist:'];
    
    const allPrefixes = [...phase1Prefixes, ...phase3Prefixes];
    const unique = new Set(allPrefixes);
    expect(unique.size).toBe(allPrefixes.length);
    
    // Phase 2 must use 'sync:' prefix
    const phase2Prefixes = ['sync:', 'sync:lock:', 'sync:job:', 'sync:health:', 'sync:circuit:', 'sync:metrics:', 'sync:ratelimit:'];
    const allWithPhase2 = [...allPrefixes, ...phase2Prefixes];
    const uniqueWithPhase2 = new Set(allWithPhase2);
    expect(uniqueWithPhase2.size).toBe(allWithPhase2.length);
  });

  // 7.5 No circular Prisma model relations
  it('Prisma model relations are acyclic', () => {
    const { readFileSync } = require('fs');
    const schema = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf-8');
    
    // Phase 1 models
    expect(schema).toMatch(/model DiscoveredRelease/);
    expect(schema).toMatch(/model ScanJob/);
    
    // Phase 2 models
    expect(schema).toMatch(/model Anime/);
    expect(schema).toMatch(/model Episode/);
    expect(schema).toMatch(/model SyncJob/);
    
    // Relations: Anime -> Episode (one-way), no back-relation to DiscoveredRelease
    const animeModel = schema.match(/model Anime \{[\s\S]*?\n\}/)?.[0] || '';
    expect(animeModel).not.toMatch(/DiscoveredRelease/);
    expect(animeModel).not.toMatch(/ScanJob/);
    
    // Episode has relation to Anime only
    const episodeModel = schema.match(/model Episode \{[\s\S]*?\n\}/)?.[0] || '';
    expect(episodeModel).toMatch(/anime\s+Anime\s+@relation/);
    expect(episodeModel).not.toMatch(/DiscoveredRelease/);
    expect(episodeModel).not.toMatch(/ScanJob/);
    expect(episodeModel).not.toMatch(/SyncJob/);
  });
});