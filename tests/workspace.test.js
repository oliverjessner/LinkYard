import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from '../src/constants.js';
import { createWorkspaceService } from '../src/services/workspace-service.js';
import { memoryStorage, workspace } from './fixtures.js';

test('concurrent captures are serialized without losing links', async () => {
  const service = createWorkspaceService(memoryStorage());
  await Promise.all(Array.from({ length: 30 }, (_, index) => service.execute(COMMANDS.ADD_LINK, {
    projectId: 'p1', input: { url: `https://example.com/article/${index}` },
  })));
  assert.equal((await service.read()).links.length, 30);
});
test('concurrent duplicates produce just one link', async () => {
  const service = createWorkspaceService(memoryStorage());
  const results = await Promise.all(Array.from({ length: 10 }, () => service.execute(COMMANDS.ADD_LINK, {
    projectId: 'p1', input: { url: 'https://example.com/article/#x' },
  })));
  assert.equal(results.filter((result) => result.duplicate).length, 9);
  assert.equal((await service.read()).links.length, 1);
});
test('a failed write does not poison later commands or falsely report success', async () => {
  const storage = memoryStorage();
  const save = storage.save;
  let fail = true;
  storage.save = async (value) => {
    if (fail) { fail = false; throw new Error('Storage full'); }
    return save(value);
  };
  const service = createWorkspaceService(storage);
  await assert.rejects(service.execute(COMMANDS.CREATE_PROJECT, { name: 'Failed' }), /Storage full/);
  await service.execute(COMMANDS.CREATE_PROJECT, { name: 'Saved' });
  const after = await service.read();
  assert.equal(after.projects.length, 3);
  assert.equal(after.projects.at(-1).name, 'Saved');
});
test('new project from a context-menu capture saves project and link atomically', async () => {
  const service = createWorkspaceService(memoryStorage());
  const result = await service.execute(COMMANDS.CREATE_PROJECT, {
    name: 'New project', linkInput: { url: 'https://example.com/selected', sourceUrl: 'https://source.test' },
  });
  assert.equal(result.workspace.links[0].projectId, result.project.id);
  assert.equal(result.workspace.settings.activeProjectId, result.project.id);
});
test('invalid pending URL prevents partial project creation', async () => {
  const service = createWorkspaceService(memoryStorage());
  await assert.rejects(service.execute(COMMANDS.CREATE_PROJECT, { name: 'Bad', linkInput: { url: 'javascript:bad' } }));
  assert.equal((await service.read()).projects.length, 2);
});
test('active project persists across worker recreation', async () => {
  const storage = memoryStorage();
  await createWorkspaceService(storage).execute(COMMANDS.SET_ACTIVE_PROJECT, { id: 'p2' });
  assert.equal((await createWorkspaceService(storage).read()).settings.activeProjectId, 'p2');
});
test('renamed links persist across worker recreation without changing their URLs', async () => {
  const storage = memoryStorage();
  const service = createWorkspaceService(storage);
  const { link } = await service.execute(COMMANDS.ADD_LINK, {
    projectId: 'p1', input: { url: 'https://example.com/article#reading', title: 'Original article' },
  });
  await service.execute(COMMANDS.RENAME_LINK, { id: link.id, title: '  Renamed article  ' });
  const after = await createWorkspaceService(storage).read();
  assert.deepEqual(after.links, [{ ...link, title: 'Renamed article' }]);
  await assert.rejects(service.execute(COMMANDS.RENAME_LINK, { id: link.id, title: '   ' }), /Give your link a name/);
  assert.deepEqual(await service.read(), after);
});
test('quick add resolves the latest active project inside the write queue', async () => {
  const service = createWorkspaceService(memoryStorage());
  const selection = service.execute(COMMANDS.SET_ACTIVE_PROJECT, { id: 'p2' });
  const capture = service.execute(COMMANDS.ADD_LINK, { input: { url: 'https://example.com' } });
  await selection;
  assert.equal((await capture).link.projectId, 'p2');
});
test('unknown commands are rejected without storage changes', async () => {
  const service = createWorkspaceService(memoryStorage());
  await assert.rejects(service.execute('unknown'));
  assert.deepEqual(await service.read(), workspace());
});
