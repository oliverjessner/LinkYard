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

test('TXT import saves a batch once and persists it across worker recreation', async () => {
  const storage = memoryStorage();
  const save = storage.save;
  let writes = 0;
  storage.save = async (value) => { writes += 1; await save(value); };
  const service = createWorkspaceService(storage);
  const result = await service.execute(COMMANDS.IMPORT_PROJECT_TXT, {
    projectId: 'p2', text: 'https://first.test\nhttps://second.test\ninvalid\nhttps://first.test/#same',
  });
  assert.equal(result.added, 2);
  assert.equal(result.duplicates, 1);
  assert.equal(result.invalid, 1);
  assert.equal(writes, 1);
  const persisted = await createWorkspaceService(storage).read();
  assert.deepEqual(persisted, result.workspace);
  assert.ok(persisted.links.every((item) => item.projectId === 'p2'));
  assert.equal(persisted.settings.activeProjectId, 'p1');
  const repeat = await service.execute(COMMANDS.IMPORT_PROJECT_TXT, { projectId: 'p2', text: 'https://first.test/' });
  assert.equal(repeat.added, 0);
  assert.equal(writes, 1);
  await service.execute(COMMANDS.IMPORT_PROJECT_TXT, { projectId: 'p2', text: 'invalid' });
  assert.equal(writes, 1);
});

test('TXT import and concurrent captures share the write queue and deduplication', async () => {
  const service = createWorkspaceService(memoryStorage());
  const results = await Promise.all([
    service.execute(COMMANDS.ADD_LINK, { projectId: 'p1', input: { url: 'https://first.test' } }),
    service.execute(COMMANDS.IMPORT_PROJECT_TXT, { projectId: 'p1', text: 'https://first.test/#same\nhttps://second.test' }),
    service.execute(COMMANDS.ADD_LINK, { projectId: 'p1', input: { url: 'https://second.test' } }),
  ]);
  assert.equal(results[1].added, 1);
  assert.equal(results[1].duplicates, 1);
  assert.equal(results[2].duplicate, true);
  assert.equal((await service.read()).links.length, 2);
});

test('failed TXT import saves leave no partial links and can be retried', async () => {
  const storage = memoryStorage();
  const save = storage.save;
  storage.save = async () => { throw new Error('Storage full'); };
  const service = createWorkspaceService(storage);
  const payload = { projectId: 'p1', text: 'https://first.test\nhttps://second.test' };
  await assert.rejects(service.execute(COMMANDS.IMPORT_PROJECT_TXT, payload), /Storage full/);
  assert.deepEqual(await service.read(), workspace());
  storage.save = save;
  assert.equal((await service.execute(COMMANDS.IMPORT_PROJECT_TXT, payload)).added, 2);
});

test('TXT import never falls back to a different project if its destination was deleted', async () => {
  const service = createWorkspaceService(memoryStorage());
  await service.execute(COMMANDS.DELETE_PROJECT, { id: 'p1' });
  const before = await service.read();
  await assert.rejects(service.execute(COMMANDS.IMPORT_PROJECT_TXT, { projectId: 'p1', text: 'https://first.test' }));
  await assert.rejects(service.execute(COMMANDS.IMPORT_PROJECT_TXT, { text: 'https://first.test' }));
  assert.deepEqual(await service.read(), before);
});
