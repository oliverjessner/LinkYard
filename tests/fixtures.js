import { sanitizeWorkspace } from '../src/storage/storage.js';

export const EARLY = '2026-10-01T08:00:00.000Z';
export const LATE = '2026-10-05T09:00:00.000Z';
export const EXPORTED = '2026-10-05T10:30:00.000Z';
export function project(id = 'p1', name = 'Research', createdAt = EARLY) {
  return { id, name, createdAt, updatedAt: createdAt };
}
export function link(id = 'l1', projectId = 'p1', url = 'https://example.com/article', createdAt = LATE) {
  return {
    id, projectId, url, normalizedUrl: url, title: 'Example Article', domain: 'example.com',
    sourceUrl: null, sourceTitle: null, createdAt, note: null, tags: [],
  };
}
export function workspace() {
  return { projects: [project(), project('p2', 'Competitors', LATE)], links: [], settings: { activeProjectId: 'p1' } };
}
export function memoryStorage(initial = workspace()) {
  let value = structuredClone(initial);
  return {
    async read() { return sanitizeWorkspace(structuredClone(value)); },
    async save(next) { value = structuredClone(next); },
  };
}
