import { ConsumetSyncAdapter, consumetSyncAdapter } from './ConsumetSyncAdapter';
import { AnivexaSyncAdapter, anivexaSyncAdapter } from './AnivexaSyncAdapter';
import type { SyncAdapter } from './SyncAdapter';

const adapters = new Map<string, ConsumetSyncAdapter | AnivexaSyncAdapter>();

export function initializeSyncAdapters(): void {
  adapters.set('consumet', consumetSyncAdapter);
  adapters.set('anivexa', anivexaSyncAdapter);
}

export function getSyncAdapter(providerId: string) {
  return adapters.get(providerId);
}

export function getAllSyncAdapters() {
  return Array.from(adapters.values());
}

export function getSyncAdapterNames() {
  return Array.from(adapters.keys());
}

export { ConsumetSyncAdapter, AnivexaSyncAdapter };
export type { SyncAdapter };