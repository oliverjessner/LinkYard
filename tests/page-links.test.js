import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, MAX_PAGE_LINKS, MAX_PAGE_LINK_BYTES } from '../src/constants.js';
import { addExternalPageLinks } from '../src/services/page-link-service.js';
import { createWorkspaceService } from '../src/services/workspace-service.js';
import { collectActiveTabLinks } from '../src/sidepanel/chrome-client.js';
import { workspace, memoryStorage, link, LATE } from './fixtures.js';

const capture = (links = []) => ({
  sourceUrl: 'https://www.source.test/research', sourceTitle: 'Research sources', links, truncated: false,
});

test('page collection appends external links with titles and source metadata only to the chosen project', () => {
  const before = workspace();
  before.links = [link(), link('other', 'p2', 'https://external.test/article')];
  const snapshot = structuredClone(before);
  const result = addExternalPageLinks(before, 'p1', capture([
    { url: 'https://external.test/article#reading', title: '  External article  ' },
    { url: 'https://other.test/notes', title: '' },
  ]), LATE);
  assert.equal(result.added, 2);
  assert.equal(result.duplicates, 0);
  assert.equal(result.skipped, 0);
  assert.deepEqual(result.workspace.links.slice(0, 2), before.links);
  assert.deepEqual(result.workspace.links.slice(2).map((item) => ({
    projectId: item.projectId, title: item.title, sourceUrl: item.sourceUrl, sourceTitle: item.sourceTitle,
  })), [
    { projectId: 'p1', title: 'External article', sourceUrl: 'https://www.source.test/research', sourceTitle: 'Research sources' },
    { projectId: 'p1', title: 'other.test', sourceUrl: 'https://www.source.test/research', sourceTitle: 'Research sources' },
  ]);
  assert.equal(result.workspace.projects[1], before.projects[1]);
  assert.equal(result.workspace.settings, before.settings);
  assert.deepEqual(before, snapshot);
});

test('page collection rejects internal and unsafe links again at the storage boundary', () => {
  const result = addExternalPageLinks(workspace(), 'p1', capture([
    { url: 'http://source.test/internal' }, { url: 'https://www.source.test/internal' },
    { url: 'javascript:alert(1)' }, { url: 'https://user:password@external.test' },
    { url: 'mailto:user@external.test' }, null, { url: 'invalid' },
    { url: 'https://sub.source.test/external', title: 'Subdomain' },
  ]));
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 7);
  assert.equal(result.workspace.links[0].title, 'Subdomain');
});

test('page collection uses existing normalization for in-page and stored duplicates', () => {
  const before = workspace();
  before.links = [link()];
  const result = addExternalPageLinks(before, 'p1', capture([
    { url: 'https://EXAMPLE.com/article/#same' },
    { url: 'https://other.test/article?q=1' }, { url: 'https://other.test/article/?q=1#same' },
    { url: 'https://other.test/article?q=2' },
  ]));
  assert.equal(result.added, 2);
  assert.equal(result.duplicates, 2);
  assert.equal(result.workspace.links[0], before.links[0]);
});

test('empty or already collected pages do not touch projects and report collection limits', () => {
  const before = workspace();
  const result = addExternalPageLinks(before, 'p1', { ...capture(), truncated: true });
  assert.equal(result.workspace, before);
  assert.equal(result.added, 0);
  assert.equal(result.truncated, true);
  before.links = [link()];
  assert.equal(addExternalPageLinks(before, 'p1', capture([{ url: before.links[0].url }])).workspace, before);
});

test('invalid page captures and missing destinations fail before writing', () => {
  for (const value of [null, {}, capture({}), { ...capture(), sourceUrl: 'file:///tmp/file' },
    capture(Array.from({ length: MAX_PAGE_LINKS + 1 }, () => ({ url: 'https://other.test' }))),
    capture([{ url: `https://other.test/${'x'.repeat(MAX_PAGE_LINK_BYTES)}` }]),
  ]) {
    assert.throws(() => addExternalPageLinks(workspace(), 'p1', value));
  }
  assert.throws(() => addExternalPageLinks(workspace(), undefined, capture()));
  assert.throws(() => addExternalPageLinks(workspace(), 'missing', capture([{ url: 'https://other.test' }])));
});

test('page collection is queued with captures, saved once and persists across worker recreation', async () => {
  const storage = memoryStorage();
  const save = storage.save;
  let writes = 0;
  storage.save = async (value) => { writes += 1; await save(value); };
  const service = createWorkspaceService(storage);
  const results = await Promise.all([
    service.execute(COMMANDS.ADD_LINK, { projectId: 'p1', input: { url: 'https://first.test' } }),
    service.execute(COMMANDS.ADD_EXTERNAL_LINKS, { projectId: 'p1', capture: capture([
      { url: 'https://first.test/#same' }, { url: 'https://second.test' },
    ]) }),
    service.execute(COMMANDS.ADD_LINK, { projectId: 'p1', input: { url: 'https://second.test' } }),
  ]);
  assert.equal(results[1].added, 1);
  assert.equal(results[1].duplicates, 1);
  assert.equal(results[2].duplicate, true);
  assert.equal(writes, 2);
  const after = await createWorkspaceService(storage).read();
  assert.equal(after.links.length, 2);
  assert.equal(after.links[1].sourceUrl, 'https://www.source.test/research');
  await service.execute(COMMANDS.ADD_EXTERNAL_LINKS, { projectId: 'p1', capture: capture() });
  assert.equal(writes, 2);
});

test('failed page collection writes leave no partial links and can be retried', async () => {
  const storage = memoryStorage();
  const save = storage.save;
  storage.save = async () => { throw new Error('Storage full'); };
  const service = createWorkspaceService(storage);
  const payload = { projectId: 'p1', capture: capture([{ url: 'https://other.test' }, { url: 'https://second.test' }]) };
  await assert.rejects(service.execute(COMMANDS.ADD_EXTERNAL_LINKS, payload), /Storage full/);
  assert.deepEqual(await service.read(), workspace());
  storage.save = save;
  assert.equal((await service.execute(COMMANDS.ADD_EXTERNAL_LINKS, payload)).added, 2);
  await service.execute(COMMANDS.DELETE_PROJECT, { id: 'p1' });
  await assert.rejects(service.execute(COMMANDS.ADD_EXTERNAL_LINKS, payload));
  assert.equal((await service.read()).links.length, 0);
});

test('active-tab collection targets only the current tab main frame in an isolated world', async (t) => {
  const expected = capture([{ url: 'https://other.test' }]);
  const calls = [];
  globalThis.chrome = {
    tabs: { query: async (options) => { calls.push(options); return [{ id: 7, url: 'https://source.test' }]; } },
    scripting: { executeScript: async (options) => {
      assert.deepEqual(options.target, { tabId: 7 });
      assert.equal(options.world, 'ISOLATED');
      assert.equal(typeof options.func, 'function');
      assert.deepEqual(options.args, [{ maxLinks: MAX_PAGE_LINKS, maxBytes: MAX_PAGE_LINK_BYTES }]);
      return [{ frameId: 0, result: expected }];
    } },
  };
  t.after(() => { delete globalThis.chrome; });
  assert.deepEqual(await collectActiveTabLinks(), expected);
  assert.deepEqual(calls, [{ active: true, currentWindow: true }]);
});

test('active-tab collection reports missing access, protected tabs and script failures without collecting', async (t) => {
  let tab;
  globalThis.chrome = {
    tabs: { query: async () => tab ? [tab] : [] },
    scripting: { executeScript: async () => { throw new Error('Cannot access contents'); } },
  };
  t.after(() => { delete globalThis.chrome; });
  await assert.rejects(collectActiveTabLinks(), /No active browser tab/);
  for (const [url, message] of [
    [undefined, /toolbar icon/], ['chrome://settings', /HTTP\/HTTPS/],
    ['https://chromewebstore.google.com/detail/test', /Chrome Web Store/],
    ['https://chrome.google.com/webstore/detail/test', /Chrome Web Store/],
    ['https://source.test', /toolbar icon/],
  ]) {
    tab = { id: 7, url };
    await assert.rejects(collectActiveTabLinks(), message);
  }
  globalThis.chrome.scripting.executeScript = async () => [{ frameId: 0 }];
  await assert.rejects(collectActiveTabLinks(), /Could not read links/);
});
