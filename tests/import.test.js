import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TXT_IMPORT_BYTES, MAX_TXT_IMPORT_LINES } from '../src/constants.js';
import { importProjectFromTxt } from '../src/services/import-service.js';
import { serializeProjectToTxt } from '../src/services/export-service.js';
import { getLinksForProject } from '../src/services/link-service.js';
import { workspace, link, LATE } from './fixtures.js';

test('TXT import trims BOM/whitespace and accepts LF, CRLF and CR with blank lines', () => {
  const before = workspace();
  const snapshot = structuredClone(before);
  const result = importProjectFromTxt(before, 'p1', '\uFEFF  https://FIRST.test/a  \r\n\r\nhttps://second.test/b\rhttp://third.test/c\n  ', LATE);
  assert.equal(result.added, 3);
  assert.equal(result.duplicates, 0);
  assert.equal(result.invalid, 0);
  assert.deepEqual(getLinksForProject(result.workspace, 'p1').map((item) => item.url), [
    'https://first.test/a', 'https://second.test/b', 'http://third.test/c',
  ]);
  assert.deepEqual(result.workspace.links[0], {
    id: result.workspace.links[0].id, projectId: 'p1', url: 'https://first.test/a',
    normalizedUrl: 'https://first.test/a', domain: 'first.test', title: 'first.test',
    createdAt: LATE, sourceUrl: null, sourceTitle: null, note: null, tags: [],
  });
  assert.deepEqual(before, snapshot);
  assert.deepEqual(result.workspace.projects[0], { ...before.projects[0], updatedAt: LATE });
  assert.equal(result.workspace.projects[1], before.projects[1]);
  assert.equal(result.workspace.settings, before.settings);
});

test('TXT import skips existing and in-file normalized duplicates only in its destination', () => {
  const before = workspace();
  before.links = [link(), link('other', 'p2', 'https://other.test/article')];
  const result = importProjectFromTxt(before, 'p1', [
    'https://EXAMPLE.com/article/#comments',
    'https://other.test/article',
    'https://other.test/article/#more',
    'https://other.test/article?id=1',
    'https://other.test/article?id=2',
  ].join('\n'));
  assert.equal(result.added, 3);
  assert.equal(result.duplicates, 2);
  assert.equal(result.invalid, 0);
  assert.deepEqual(result.workspace.links.slice(0, 2), before.links);
  assert.equal(getLinksForProject(result.workspace, 'p2').length, 1);
});

test('TXT import skips unsafe URLs, credentials, malformed and multi-URL lines', () => {
  const result = importProjectFromTxt(workspace(), 'p1', [
    'javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/links', 'ftp://example.com',
    'https://user:password@example.com', 'not a URL', 'www.example.com',
    'https://example.com/one https://example.com/two', 'https://exam\tple.com',
    'https://example.com/\u0000', 'https://good.test/search?q=two%20words',
  ].join('\n'));
  assert.equal(result.added, 1);
  assert.equal(result.invalid, 10);
  assert.equal(result.workspace.links[0].url, 'https://good.test/search?q=two%20words');
});

test('TXT import with no additions leaves timestamps and workspace unchanged', () => {
  const before = workspace();
  before.links = [link()];
  for (const text of ['https://example.com/article#same', 'invalid\nfile:///tmp/test']) {
    const result = importProjectFromTxt(before, 'p1', text, LATE);
    assert.equal(result.added, 0);
    assert.equal(result.workspace, before);
  }
});

test('TXT import rejects missing destinations and empty or non-text input', () => {
  for (const projectId of [null, undefined, 'missing']) {
    assert.throws(() => importProjectFromTxt(workspace(), projectId, 'https://example.com'));
  }
  for (const text of ['', '\uFEFF \r\n\t\n']) {
    assert.throws(() => importProjectFromTxt(workspace(), 'p1', text), /contains no links/);
  }
  for (const text of [null, undefined, {}, 42]) {
    assert.throws(() => importProjectFromTxt(workspace(), 'p1', text), /UTF-8 TXT/);
  }
});

test('TXT import enforces UTF-8 byte and non-empty line limits before any additions', () => {
  const before = workspace();
  assert.throws(() => importProjectFromTxt(before, 'p1', 'é'.repeat(MAX_TXT_IMPORT_BYTES / 2 + 1)), /up to 1 MB/);
  assert.throws(() => importProjectFromTxt(before, 'p1', 'https://example.com\n'.repeat(MAX_TXT_IMPORT_LINES + 1)), /10,000 non-empty lines/);
  const boundary = importProjectFromTxt(before, 'p1', 'https://example.com\n'.repeat(MAX_TXT_IMPORT_LINES));
  assert.equal(boundary.added, 1);
  assert.equal(boundary.duplicates, MAX_TXT_IMPORT_LINES - 1);
  assert.deepEqual(before, workspace());
});

test('TXT exports can be imported into another project preserving URL order', () => {
  const before = workspace();
  before.links = [link('a', 'p1', 'https://example.com/one#section'), link('b', 'p1', 'https://other.test/two')];
  const exported = serializeProjectToTxt(before.projects[0], before.links);
  const result = importProjectFromTxt(before, 'p2', exported, LATE);
  assert.equal(result.added, 2);
  assert.equal(serializeProjectToTxt(result.workspace.projects[1], result.workspace.links), exported);
});
