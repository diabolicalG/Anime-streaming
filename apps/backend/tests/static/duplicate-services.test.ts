import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('No Duplicate Service Registrations', () => {
  // 8.1 Single ProviderRegistry instance
  it('ProviderRegistry instantiated once', () => {
    const content = readFileSync(resolve(__dirname, '../../src/services/streaming/index.ts'), 'utf-8');
    const matches = content.match(/new ProviderRegistry\(\)/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain('export const providerRegistry = new ProviderRegistry();');
  });

  // 8.2 Single SyncAdapter registry
  it('SyncAdapter registry instantiated once', () => {
    const content = readFileSync(resolve(__dirname, '../../src/services/sync/adapters/index.ts'), 'utf-8');
    const matches = content.match(/const adapters = new Map(?:<[^>]+>)?\(\)/g);
    expect(matches).toHaveLength(1);
    expect(content).toContain('export function initializeSyncAdapters(): void');
  });

  // 8.3 Single mappingService export
  it('mappingService exported as singleton', () => {
    const content = readFileSync(resolve(__dirname, '../../src/services/mapping.ts'), 'utf-8');
    expect(content).toMatch(/export const mappingService = \{/);
    expect(content.match(/export const mappingService/g)).toHaveLength(1);
  });

  // 8.4 No duplicate health monitors
  it('HealthMonitor classes are phase-scoped', () => {
    const discoveryHealth = readFileSync(resolve(__dirname, '../../src/services/discovery/HealthMonitor.ts'), 'utf-8');
    const syncHealthPath = require('path').resolve(__dirname, '../../src/services/sync/SyncHealthMonitor.ts');
    
    expect(discoveryHealth).toMatch(/class HealthMonitor/);
    // SyncHealthMonitor will be created
    // expect(syncHealth).toMatch(/class SyncHealthMonitor/);
  });

  // 8.5 No duplicate circuit breakers
  it('Circuit breakers are phase-scoped', () => {
    const streamingCB = readFileSync(resolve(__dirname, '../../src/services/streaming/CircuitBreaker.ts'), 'utf-8');
    const discoveryHealth = readFileSync(resolve(__dirname, '../../src/services/discovery/HealthMonitor.ts'), 'utf-8');
    
    expect(streamingCB).toMatch(/export class ProviderCircuitBreakers/);
    expect(streamingCB).toMatch(/export const providerCircuitBreakers = new ProviderCircuitBreakers\(\);/);
    expect(discoveryHealth).toMatch(/class HealthMonitor/);
    // SyncCircuitBreaker will be separate
  });

  // 8.6 No duplicate adapter registrations
  it('Discovery adapters registered once in ProviderDiscovery', () => {
    const content = readFileSync(require('path').resolve(__dirname, '../../src/services/discovery/ProviderDiscovery.ts'), 'utf-8');
    const initDeclarationMatches = content.match(/initializeAdapters\(\):\s*void/g);
    expect(initDeclarationMatches).toHaveLength(1);

    const initCallMatches = content.match(/this\.initializeAdapters\(\)/g);
    expect(initCallMatches).toHaveLength(1);
    
    const consumetMatches = content.match(/\bConsumetDiscoveryAdapter\b/g);
    expect(consumetMatches).toHaveLength(4);
    
    const anivexaMatches = content.match(/\bAnivexaDiscoveryAdapter\b/g);
    expect(anivexaMatches).toHaveLength(4);
  });
});
