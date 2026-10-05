import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeWorkspace, createStorage } from '../src/storage/storage.js';
import { workspace, link } from './fixtures.js';

test('missing storage keys use empty defaults', () => {
  assert.deepEqual(sanitizeWorkspace({}), { projects: [], links: [], settings: { activeProjectId: null } });
});
test('missing active project falls back to first surviving project', () => {
  const before = workspace();
  before.settings.activeProjectId = 'deleted';
  assert.equal(sanitizeWorkspace(before).settings.activeProjectId, 'p1');
});
test('damaged records, duplicate IDs and orphaned links do not crash the app', () => {
  const before = workspace();
  before.projects.push(null, before.projects[0], { id: 'invalid', name: 'Bad' });
  before.links = [link(), null, link('orphan', 'missing'), { ...link('bad'), url: 'javascript:alert(1)' }];
  const warnings = [];
  const after = sanitizeWorkspace(before, (message) => warnings.push(message));
  assert.equal(after.projects.length, 2);
  assert.equal(after.links.length, 1);
  assert.equal(warnings.length, 6);
});
test('broken collections fall back independently', () => {
  const warnings = [];
  const after = sanitizeWorkspace({ projects: {}, links: null, settings: false }, (message) => warnings.push(message));
  assert.equal(after.projects.length, 0);
  assert.equal(after.links.length, 0);
  assert.equal(after.settings.activeProjectId, null);
  assert.equal(warnings.length, 2);
});
test('stored normalization and title are repaired; optional fields get safe defaults', () => {
  const before = workspace();
  before.links = [{ ...link(), url: 'https://EXAMPLE.com/article/#x', normalizedUrl: 'wrong', title: '', tags: 'bad' }];
  const item = sanitizeWorkspace(before).links[0];
  assert.equal(item.normalizedUrl, 'https://example.com/article');
  assert.equal(item.title, 'example.com');
  assert.deepEqual(item.tags, []);
});
test('stored duplicate URLs are discarded within each project', () => {
  const before = workspace();
  before.links = [link(), { ...link('l2'), url: 'https://example.com/article/#x' }, link('l3', 'p2')];
  assert.equal(sanitizeWorkspace(before, () => {}).links.length, 2);
});
test('discarding a damaged duplicate ID does not hide a later valid URL', () => {
  const before = workspace();
  before.links = [link(), link('l1', 'p1', 'https://example.com/second'), link('l2', 'p1', 'https://example.com/second')];
  assert.deepEqual(sanitizeWorkspace(before, () => {}).links.map((item) => item.id), ['l1', 'l2']);
});
test('storage adapter saves all related keys in one operation', async () => {
  let saved;
  const adapter = createStorage({ get: async () => ({}), set: async (value) => { saved = value; } });
  assert.equal((await adapter.read()).projects.length, 0);
  await adapter.save(workspace());
  assert.deepEqual(saved, workspace());
});
