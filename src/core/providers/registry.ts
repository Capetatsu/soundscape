import type { Capability, ProviderBase, ProviderId } from './types';

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
