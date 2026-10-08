import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeProjectToJson, serializeProjectToTxt,
  exportFilename, createExportService,
} from '../src/services/export-service.js';
import { project, link, workspace, EARLY, LATE, EXPORTED } from './fixtures.js';

test('project JSON is valid, versioned, indented and contains only project links', () => {
  const text = serializeProjectToJson(project(), [link(), link('other', 'p2')], EXPORTED);
  const data = JSON.parse(text);
  assert.equal(data.format, 'linky-yard');
  assert.equal(data.version, 1);
  assert.equal(data.exportedAt, EXPORTED);
  assert.equal(data.project.name, 'Research');
  assert.equal(data.links.length, 1);
  assert.equal(data.links[0].url, 'https://example.com/article');
  assert.equal('projectId' in data.links[0], false);
  assert.equal('settings' in data, false);
  assert.match(text, /\n  "format"/);
});
test('empty project exports in JSON and TXT', () => {
  assert.deepEqual(JSON.parse(serializeProjectToJson(project(), [])).links, []);
  assert.equal(serializeProjectToTxt(project(), []), '');
});
test('project TXT contains only its URLs, one per line, without metadata', () => {
  const links = [
    { ...link(), sourceUrl: 'https://reddit.com/r/example', sourceTitle: 'Source title', note: 'Saved note', tags: ['research'] },
    link('older', 'p1', 'https://example.com/older', EARLY),
    link('other', 'p2', 'https://other.test'),
  ];
  assert.equal(serializeProjectToTxt(project(), links, EXPORTED), 'https://example.com/article\nhttps://example.com/older');
});
test('missing optional metadata is valid and creates no undefined text', () => {
  const item = link();
  delete item.sourceUrl; delete item.sourceTitle; delete item.title; delete item.note; delete item.tags;
  const data = JSON.parse(serializeProjectToJson(project(), [item]));
  assert.equal(data.links[0].sourceUrl, null);
  assert.equal(data.links[0].title, 'example.com');
  assert.deepEqual(data.links[0].tags, []);
  assert.equal(serializeProjectToTxt(project(), [item]), 'https://example.com/article');
});
test('project exports use deterministic link ordering and exclude other projects', () => {
  const selectedProject = project();
  const links = [
    link('old', 'p1', 'https://example.com/old', EARLY),
    link('new-b', 'p1', 'https://example.com/new-b', LATE),
    link('second', 'p2', 'https://example.com/old'),
    link('new-a', 'p1', 'https://example.com/new-a', LATE),
    link('later', 'p3', 'https://example.com/later'),
    link('orphan', 'missing', 'https://example.com/orphan'),
  ];
  const data = JSON.parse(serializeProjectToJson(selectedProject, links, EXPORTED));
  assert.deepEqual(data.links.map((item) => item.id), ['new-a', 'new-b', 'old']);
  assert.equal(serializeProjectToTxt(selectedProject, links), [
    'https://example.com/new-a', 'https://example.com/new-b', 'https://example.com/old',
  ].join('\n'));
});
test('filename normalization handles whitespace, unsafe symbols and empty slugs', () => {
  assert.equal(exportFilename('OpenAI Research', 'json'), 'openai-research-linkyard.json');
  assert.equal(exportFilename('AI / EU: Research?', 'txt'), 'ai-eu-research-linkyard.txt');
  assert.equal(exportFilename('  Über Recherche  ', 'json'), 'uber-recherche-linkyard.json');
  assert.equal(exportFilename('💚', 'txt'), 'project-linkyard.txt');
  assert.ok(exportFilename('x'.repeat(500), 'json').length < 100);
  assert.throws(() => exportFilename('Research', 'exe'));
});
test('export service reads fresh data and downloads with correct names and MIME types', async () => {
  const before = workspace();
  before.links = [link()];
  const downloads = [];
  const service = createExportService(async () => before, async (...args) => downloads.push(args));
  await service.exportProjectAsJson('p1');
  await service.exportProjectAsTxt('p1');
  assert.deepEqual(downloads.map((args) => args.slice(1)), [
    ['research-linkyard.json', 'application/json'], ['research-linkyard.txt', 'text/plain'],
  ]);
  assert.equal(downloads[1][0], 'https://example.com/article');
  await assert.rejects(service.exportProjectAsJson('missing'));
});
