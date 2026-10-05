import test from 'node:test';
import assert from 'node:assert/strict';
import { addLink, deleteLink, moveLink, getLinksForProject } from '../src/services/link-service.js';
import { workspace, link, EARLY, LATE } from './fixtures.js';

test('captures normalized URLs, source metadata and timestamps', () => {
  const before = workspace();
  const result = addLink(before, 'p1', {
    url: 'https://EXAMPLE.com/article/#comments', title: ' Article ',
    sourceUrl: 'https://reddit.com/r/example', sourceTitle: ' Discussion ',
  }, { id: 'l1', now: LATE });
  assert.equal(result.link.url, 'https://example.com/article/#comments');
  assert.equal(result.link.normalizedUrl, 'https://example.com/article');
  assert.equal(result.link.title, 'Article');
  assert.equal(result.link.sourceTitle, 'Discussion');
  assert.equal(result.link.createdAt, LATE);
  assert.deepEqual(result.link.tags, []);
  assert.equal(before.links.length, 0);
});
test('manual links fall back to domain and have null optional metadata', () => {
  const { link: item } = addLink(workspace(), 'p1', { url: 'https://example.com' });
  assert.equal(item.title, 'example.com');
  assert.equal(item.sourceUrl, null);
  assert.equal(item.sourceTitle, null);
  assert.equal(item.note, null);
});
test('duplicates with fragments and trailing slashes return feedback without writing', () => {
  const first = addLink(workspace(), 'p1', { url: 'https://example.com/article' });
  const second = addLink(first.workspace, 'p1', { url: 'https://example.com/article/#comments' });
  assert.equal(second.duplicate, true);
  assert.equal(second.workspace, first.workspace);
  assert.equal(second.workspace.links.length, 1);
});
test('same URL can be collected in separate projects', () => {
  const first = addLink(workspace(), 'p1', { url: 'https://example.com/article' });
  const second = addLink(first.workspace, 'p2', { url: 'https://example.com/article' });
  assert.equal(second.duplicate, false);
  assert.equal(second.workspace.links.length, 2);
});
test('different query values are separate links', () => {
  const first = addLink(workspace(), 'p1', { url: 'https://example.com?id=1' });
  assert.equal(addLink(first.workspace, 'p1', { url: 'https://example.com?id=2' }).duplicate, false);
});
test('move preserves URL, ID, source and creation date', () => {
  const before = workspace();
  before.links = [link()];
  const after = moveLink(before, 'l1', 'p2', LATE);
  assert.equal(after.duplicate, false);
  assert.deepEqual(after.workspace.links[0], { ...before.links[0], projectId: 'p2' });
  assert.equal(before.links[0].projectId, 'p1');
});
test('move into a project with the same normalized URL is blocked', () => {
  const before = workspace();
  before.links = [link(), link('l2', 'p2')];
  const after = moveLink(before, 'l1', 'p2');
  assert.equal(after.duplicate, true);
  assert.equal(after.workspace, before);
});
test('move to the same project is harmless', () => {
  const before = workspace();
  before.links = [link()];
  assert.equal(moveLink(before, 'l1', 'p1').workspace, before);
});
test('missing projects, missing links and unsafe URLs fail before writing', () => {
  assert.throws(() => addLink(workspace(), 'missing', { url: 'https://example.com' }));
  assert.throws(() => addLink(workspace(), 'p1', { url: 'javascript:alert(1)' }));
  assert.throws(() => moveLink(workspace(), 'missing', 'p2'));
  assert.throws(() => deleteLink(workspace(), 'missing'));
});
test('delete removes only the specified link', () => {
  const before = workspace();
  before.links = [link(), link('l2', 'p2')];
  assert.deepEqual(deleteLink(before, 'l1').links.map((item) => item.id), ['l2']);
});
test('search matches all supported fields case-insensitively in the active project', () => {
  const before = workspace();
  before.links = [{ ...link(), sourceTitle: 'Unique Discussion', sourceUrl: 'https://source.test/x' }, link('l2', 'p2')];
  for (const query of ['EXAMPLE ARTICLE', 'https://example.com/article', 'EXAMPLE.COM', 'UNIQUE', 'SOURCE.TEST']) {
    assert.equal(getLinksForProject(before, 'p1', query).length, 1);
  }
  assert.equal(getLinksForProject(before, 'p1', 'absent').length, 0);
});
test('links sort newest first, with stable ties', () => {
  const before = workspace();
  before.links = [link('z', 'p1', 'https://example.com/early', EARLY), link('b'), link('a')];
  assert.deepEqual(getLinksForProject(before, 'p1').map((item) => item.id), ['a', 'b', 'z']);
});
