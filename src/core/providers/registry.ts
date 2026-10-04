import type { Capability, ProviderBase, ProviderId } from './types';
import { jamendoConfigured } from './jamendo/jamendoClient';

// Central provider registry. UI reads capabilities from here — never hardcodes.
const providers = new Map<ProviderId, ProviderBase>();

export function registerProvider(p: ProviderBase): void {
  providers.set(p.id, p);
}

export function getProvider(id: ProviderId): ProviderBase | null {
  return providers.get(id) ?? null;
}

export function providerSupports(id: ProviderId, cap: Capability): boolean {
  return providers.get(id)?.supports(cap) ?? false;
}

export function listProviders(): ProviderBase[] {
  return [...providers.values()];
}

export interface ProviderSummary {
  id: ProviderId;
  caps: Capability[];
  connected: boolean;
  detail: string;
}

/** UI-facing capability matrix (P2): explicit per-provider caps + live status. */
export function describeProviders(): ProviderSummary[] {
  return listProviders().map((p) => {
    const s = safeStatus(p);
    return { id: p.id, caps: [...p.caps], connected: s.connected, detail: s.detail ?? '' };
  });
}

function safeStatus(p: ProviderBase): { connected: boolean; detail?: string } {
  try {
    return p.status();
  } catch {
    return { connected: false, detail: 'status check failed' };
  }
}

/** Jamendo needs a key before its caps mean anything — report honestly. */
export function jamendoEffectiveCaps(): Capability[] {
  if (!jamendoConfigured()) return [];
  return [...(getProvider('jamendo')?.caps ?? [])];
}
