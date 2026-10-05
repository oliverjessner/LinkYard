import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProjectName } from '../src/utils/validation.js';
import { createProject, renameProject, deleteProject, setActiveProject, getProject } from '../src/services/project-service.js';
import { workspace, link, LATE } from './fixtures.js';

test('rejects empty, whitespace, non-string and overly long project names', () => {
  for (const name of ['', '  ', null, {}, 'a'.repeat(101)]) assert.throws(() => validateProjectName(name));
  assert.equal(validateProjectName('a'.repeat(100)).length, 100);
});
test('creates a trimmed project, activates it and keeps the input immutable', () => {
  const before = workspace();
  const result = createProject(before, '  OpenAI Research  ', { id: 'p3', now: LATE });
  assert.equal(result.project.name, 'OpenAI Research');
  assert.equal(result.workspace.settings.activeProjectId, 'p3');
  assert.equal(result.project.createdAt, LATE);
  assert.equal(before.projects.length, 2);
  assert.equal(before.settings.activeProjectId, 'p1');
});
test('uses random UUIDs when creating projects', () => {
  assert.match(createProject(workspace(), 'New').project.id, /^[0-9a-f-]{36}$/);
});
test('renames safely, trims input and updates timestamp', () => {
  const before = workspace();
  const after = renameProject(before, 'p1', '  AI / EU: Research?  ', LATE);
  assert.equal(getProject(after, 'p1').name, 'AI / EU: Research?');
  assert.equal(getProject(after, 'p1').updatedAt, LATE);
  assert.equal(getProject(before, 'p1').name, 'Research');
});
test('rename and selection reject invalid inputs', () => {
  assert.throws(() => renameProject(workspace(), 'p1', ' '));
  assert.throws(() => renameProject(workspace(), 'missing', 'Name'));
  assert.throws(() => setActiveProject(workspace(), 'missing'));
});
test('deleting active project cascades links and activates the next project', () => {
  const before = workspace();
  before.links = [link(), link('l2', 'p2')];
  const after = deleteProject(before, 'p1');
  assert.equal(after.settings.activeProjectId, 'p2');
  assert.deepEqual(after.links.map((item) => item.id), ['l2']);
  assert.equal(before.links.length, 2);
});
test('deleting inactive project preserves selection', () => {
  assert.equal(deleteProject(workspace(), 'p2').settings.activeProjectId, 'p1');
});
test('deleting the last project yields a clean empty state', () => {
  const after = deleteProject(deleteProject(workspace(), 'p2'), 'p1');
  assert.deepEqual(after, { projects: [], links: [], settings: { activeProjectId: null } });
});
test('selecting a project changes only settings', () => {
  const before = workspace();
  const after = setActiveProject(before, 'p2');
  assert.equal(after.settings.activeProjectId, 'p2');
  assert.equal(after.projects, before.projects);
});
