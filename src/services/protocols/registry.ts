import type { ProtocolAdapter } from "./types";
import { blendAdapter } from "./blend-adapter";

/**
 * Protocol adapter registry. Adding a protocol = register a new adapter here; no
 * other code changes. (Sprint 7D — Blend only; no new protocols.)
 */
const ADAPTERS: Record<string, ProtocolAdapter> = {
  [blendAdapter.protocol]: blendAdapter,
};

export function getProtocolAdapter(protocol: string): ProtocolAdapter | undefined {
  return ADAPTERS[protocol];
}

export function requireProtocolAdapter(protocol: string): ProtocolAdapter {
  const adapter = ADAPTERS[protocol];
  if (!adapter) throw new Error(`Unknown protocol: ${protocol}`);
  return adapter;
}

export function listProtocols(): string[] {
  return Object.keys(ADAPTERS);
}
