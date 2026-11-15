import "server-only";

/*
 * Demo-run state held in process memory. The fallback proposal files are committed, so a proposal
 * existing does not mean the stakeholder was built in this demo run. Every stakeholder starts at
 * "not built"; building marks it here. Kept on globalThis so dev-server module reloads keep it.
 */

type WorkspaceMemory = { built: Set<string>; sentAt: Map<string, string> };
const globalStore = globalThis as typeof globalThis & { __tmWorkspace?: WorkspaceMemory };
const memory: WorkspaceMemory = (globalStore.__tmWorkspace ??= { built: new Set(), sentAt: new Map() });

export function markBuilt(clientId: string): void {
  memory.built.add(clientId);
}

export function isBuilt(clientId: string): boolean {
  return memory.built.has(clientId);
}

/** Records when the proposal was sent (ISO timestamp). */
export function markSent(clientId: string, iso: string): void {
  memory.sentAt.set(clientId, iso);
}

export function getSentAt(clientId: string): string | null {
  return memory.sentAt.get(clientId) ?? null;
}

export function clearWorkspaceMemory(): void {
  memory.built.clear();
  memory.sentAt.clear();
}
