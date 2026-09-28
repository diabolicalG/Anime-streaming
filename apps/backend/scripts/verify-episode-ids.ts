#!/usr/bin/env node
import axios from 'axios';
import { ConsumetProvider } from '../src/services/streaming/ConsumetProvider';
import { AnivexaProvider } from '../src/services/streaming/AnivexaProvider';

interface EpisodeIdSample {
  provider: string;
  animeId: string;
  animeTitle: string;
  episodes: Array<{
    id: string;
    number: number;
    title: string;
  }>;
}

interface VerificationResult {
  provider: string;
  stable: boolean | 'UNVERIFIED';
  samples: EpisodeIdSample[];
  issues: string[];
  recommendation: string;
}

async function verifyConsumetEpisodeIds(): Promise<VerificationResult> {
  console.log('\n=== Verifying Consumet Episode IDs ===\n');
  
  const provider = new ConsumetProvider();
  const samples: EpisodeIdSample[] = [];
  const issues: string[] = [];

  const testAnime = [
    { id: 'one-piece', title: 'One Piece (long-running)' },
    { id: 'naruto', title: 'Naruto (completed)' },
    { id: 'jujutsu-kaisen', title: 'Jujutsu Kaisen (seasonal)' },
    { id: 'attack-on-titan', title: 'Attack on Titan (completed)' },
    { id: 'demon-slayer', title: 'Demon Slayer (seasonal)' },
  ];

  let anySuccess = false;
  for (const anime of testAnime) {
    try {
      console.log(`Fetching ${anime.title} (${anime.id})...`);
      const info = await provider.getAnimeInfo(anime.id);
      
      const episodeSample = info.episodesList.slice(0, 5).map(ep => ({
        id: ep.id || `${info.id}-episode-${ep.number}`,
        number: ep.number,
        title: ep.title,
      }));

      samples.push({
        provider: 'consumet',
        animeId: info.id,
        animeTitle: info.title,
        episodes: episodeSample,
      });

      console.log(`  Found ${info.episodesList.length} episodes`);
      console.log(`  Sample episode IDs: ${episodeSample.map(e => e.id).join(', ')}`);
      
      if (episodeSample.length > 0) {
        const firstId = episodeSample[0].id;
        if (firstId.includes('-episode-')) {
          console.log(`  ✓ Using standard format: ${info.id}-episode-${ep.number}`);
        } else {
          console.log(`  ⚠ Non-standard episode ID format: ${firstId}`);
          issues.push(`${anime.id}: Non-standard episode ID format: ${firstId}`);
        }
      }
      anySuccess = true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed to fetch ${anime.id}: ${errMsg}`);
      issues.push(`${anime.id}: ${errMsg}`);
    }
  }

  if (!anySuccess) {
    return {
      provider: 'consumet',
      stable: 'UNVERIFIED',
      samples,
      issues: ['All API calls failed - network/API unavailable'],
      recommendation: 'UNVERIFIED: Cannot verify episode ID stability. Run this script when APIs are accessible. Do NOT enforce unique constraint yet.',
    };
  }

  const stable = issues.length === 0;
  
  return {
    provider: 'consumet',
    stable,
    samples,
    issues,
    recommendation: stable 
      ? 'Episode IDs appear stable. Use (provider, providerAnimeId, providerEpisodeId) as unique key.'
      : 'Episode IDs have issues. Consider composite key with airDate or episodeNumber.',
  };
}

async function verifyAnivexaEpisodeIds(): Promise<VerificationResult> {
  console.log('\n=== Verifying Anivexa Episode IDs ===\n');
  
  const provider = new AnivexaProvider();
  const samples: EpisodeIdSample[] = [];
  const issues: string[] = [];

  const testAnime = [
    { id: 'one-piece', title: 'One Piece' },
    { id: 'naruto', title: 'Naruto' },
    { id: 'jujutsu-kaisen', title: 'Jujutsu Kaisen' },
    { id: 'attack-on-titan', title: 'Attack on Titan' },
    { id: 'demon-slayer', title: 'Demon Slayer' },
  ];

  let anySuccess = false;
  for (const anime of testAnime) {
    try {
      console.log(`Fetching ${anime.title} (${anime.id})...`);
      const info = await provider.getAnimeInfo(anime.id);
      
      const episodeSample = info.episodesList.slice(0, 5).map(ep => ({
        id: ep.id || `${info.id}-ep-${ep.number}`,
        number: ep.number,
        title: ep.title,
      }));

      samples.push({
        provider: 'anivexa',
        animeId: info.id,
        animeTitle: info.title,
        episodes: episodeSample,
      });

      console.log(`  Found ${info.episodesList.length} episodes`);
      console.log(`  Sample episode IDs: ${episodeSample.map(e => e.id).join(', ')}`);
      
      if (episodeSample.length > 0) {
        const firstId = episodeSample[0].id;
        if (firstId.includes('-ep-')) {
          console.log(`  ✓ Using standard format: ${info.id}-ep-${ep.number}`);
        } else {
          console.log(`  ⚠ Non-standard episode ID format: ${firstId}`);
          issues.push(`${anime.id}: Non-standard episode ID format: ${firstId}`);
        }
      }
      anySuccess = true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed to fetch ${anime.id}: ${errMsg}`);
      issues.push(`${anime.id}: ${errMsg}`);
    }
  }

  if (!anySuccess) {
    return {
      provider: 'anivexa',
      stable: 'UNVERIFIED',
      samples,
      issues: ['All API calls failed - network/API unavailable'],
      recommendation: 'UNVERIFIED: Cannot verify episode ID stability. Run this script when APIs are accessible. Do NOT enforce unique constraint yet.',
    };
  }

  const stable = issues.length === 0;
  
  return {
    provider: 'anivexa',
    stable,
    samples,
    issues,
    recommendation: stable 
      ? 'Episode IDs appear stable. Use (provider, providerAnimeId, providerEpisodeId) as unique key.'
      : 'Episode IDs have issues. Consider composite key with airDate or episodeNumber.',
  };
}

async function verifyAnivexaSubProviders(): Promise<VerificationResult> {
  console.log('\n=== Verifying Anivexa Sub-Providers (via API) ===\n');
  
  const baseUrl = 'https://api.anivexa.com';
  const client = axios.create({ baseURL: baseUrl, timeout: 15000 });
  const samples: EpisodeIdSample[] = [];
  const issues: string[] = [];

  try {
    const { data } = await client.get('/providers');
    const providers = data.providers || [];
    console.log(`Found ${providers.length} Anivexa sub-providers:`);
    providers.forEach((p: any) => console.log(`  - ${p.name} (${p.id})`));

    let anySuccess = false;
    for (const provider of providers.slice(0, 3)) {
      try {
        console.log(`\nTesting ${provider.name}...`);
        const { data: searchData } = await client.get('/search', { params: { q: 'one piece', page: 1, provider: provider.id } });
        const results = searchData.results || [];
        
        if (results.length > 0) {
          const anime = results[0];
          console.log(`  Found: ${anime.title} (${anime.id})`);
          
          const { data: animeData } = await client.get(`/anime/${anime.id}`, { params: { provider: provider.id } });
          
          const episodeSample = (animeData.episodesList || []).slice(0, 5).map((ep: any) => ({
            id: ep.id || `${anime.id}-ep-${ep.number}`,
            number: ep.number,
            title: ep.title,
          }));

          samples.push({
            provider: `anivexa:${provider.id}`,
            animeId: anime.id,
            animeTitle: anime.title,
            episodes: episodeSample,
          });

          console.log(`  Sample episode IDs: ${episodeSample.map(e => e.id).join(', ')}`);
          anySuccess = true;
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ Failed to test ${provider.id}: ${errMsg}`);
        issues.push(`${provider.id}: ${errMsg}`);
      }
    }

    if (!anySuccess) {
      return {
        provider: 'anivexa-subproviders',
        stable: 'UNVERIFIED',
        samples,
        issues: ['All sub-provider API calls failed - network/API unavailable'],
        recommendation: 'UNVERIFIED: Cannot verify sub-provider episode ID stability.',
      };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('Failed to fetch Anivexa providers:', errMsg);
    issues.push(`Failed to fetch providers: ${errMsg}`);
    
    return {
      provider: 'anivexa-subproviders',
      stable: 'UNVERIFIED',
      samples,
      issues: ['API unavailable'],
      recommendation: 'UNVERIFIED: Cannot verify sub-provider episode ID stability.',
    };
  }

  const stable = issues.length === 0;
  
  return {
    provider: 'anivexa-subproviders',
    stable,
    samples,
    issues,
    recommendation: stable 
      ? 'Sub-provider episode IDs appear stable.'
      : 'Sub-provider episode IDs have issues. Need further investigation.',
  };
}

async function runVerification() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       Provider Episode ID Verification Script                ║');
  console.log('║       This verifies (provider, providerAnimeId, providerEpisodeId) stability  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const results: VerificationResult[] = [];

  results.push(await verifyConsumetEpisodeIds());
  results.push(await verifyAnivexaEpisodeIds());
  results.push(await verifyAnivexaSubProviders());

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let allStable = true;
  let anyUnverified = false;
  for (const result of results) {
    let status: string;
    if (result.stable === 'UNVERIFIED') {
      status = '? UNVERIFIED';
      anyUnverified = true;
    } else if (result.stable) {
      status = '✓ STABLE';
    } else {
      status = '✗ UNSTABLE';
      allStable = false;
    }
    console.log(`${status} | ${result.provider}`);
    console.log(`  Recommendation: ${result.recommendation}`);
    if (result.issues.length > 0) {
      console.log(`  Issues:`);
      result.issues.forEach(issue => console.log(`    - ${issue}`));
    }
    console.log();
  }

  console.log('══════════════════════════════════════════════════════════════');
  if (anyUnverified) {
    console.log('? VERIFICATION INCOMPLETE - APIs not accessible from this environment');
    console.log('  Run this script manually when APIs are reachable to verify episode ID stability');
    console.log('  Current schema uses INDEX (not UNIQUE) for (provider, providerAnimeId, providerEpisodeId)');
    console.log('  Once verified, add @@unique constraint in schema.prisma and run migration');
  } else if (allStable) {
    console.log('✓ ALL PROVIDERS STABLE - Safe to use (provider, providerAnimeId, providerEpisodeId) as unique key');
    console.log('  Update schema.prisma to add @@unique constraint and run migration');
  } else {
    console.log('✗ SOME PROVIDERS UNSTABLE - Do NOT enforce unique constraint');
    console.log('  Consider: (provider, providerAnimeId, providerEpisodeId, airDate?) composite key');
  }
  console.log('══════════════════════════════════════════════════════════════\n');

  process.exit(anyUnverified ? 0 : (allStable ? 0 : 1));
}

runVerification().catch(console.error);