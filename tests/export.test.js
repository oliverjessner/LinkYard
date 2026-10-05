import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serializeProjectToJson, serializeProjectToTxt, serializeAllToJson, serializeAllToTxt,
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
  assert.match(serializeProjectToTxt(project(), []), /Project: Research/);
  assert.match(serializeProjectToTxt(project(), []), /Links: 0/);
});
test('TXT includes project, title, URL, source and added timestamp', () => {
  const text = serializeProjectToTxt(project(), [{ ...link(), sourceUrl: 'https://reddit.com/r/example' }], EXPORTED);
  for (const part of ['Project: Research', 'Example Article', 'https://example.com/article', 'Source:\nhttps://reddit.com/r/example', `Added:\n${LATE}`]) assert.ok(text.includes(part));
});
test('missing optional metadata is valid and creates no undefined text', () => {
  const item = link();
  delete item.sourceUrl; delete item.sourceTitle; delete item.title; delete item.note; delete item.tags;
  const data = JSON.parse(serializeProjectToJson(project(), [item]));
  assert.equal(data.links[0].sourceUrl, null);
  assert.equal(data.links[0].title, 'example.com');
  assert.deepEqual(data.links[0].tags, []);
  assert.doesNotMatch(serializeProjectToTxt(project(), [item]), /undefined|null|Source:/);
});
test('global JSON and TXT include multiple projects and correct totals', () => {
  const projects = workspace().projects;
  const links = [link(), link('second', 'p2', 'https://other.test')];
  const data = JSON.parse(serializeAllToJson(projects, links, EXPORTED));
  assert.equal(data.format, 'linky-yard');
  assert.equal(data.version, 1);
  assert.equal(data.projects.length, 2);
  assert.equal(data.projects[1].links[0].url, 'https://other.test');
  const text = serializeAllToTxt(projects, links, EXPORTED);
  for (const part of ['Projects: 2', 'Links: 2', 'RESEARCH', 'COMPETITORS', 'https://other.test']) assert.ok(text.includes(part));
});
test('exports deterministic project and link ordering', () => {
  const projects = [project('p2', 'Later', LATE), project('p1', 'Earlier', EARLY)];
  const links = [link('old', 'p1', 'https://example.com/old', EARLY), link('new', 'p1', 'https://example.com/new', LATE)];
  const data = JSON.parse(serializeAllToJson(projects, links, EXPORTED));
  assert.deepEqual(data.projects.map((item) => item.id), ['p1', 'p2']);
  assert.deepEqual(data.projects[0].links.map((item) => item.id), ['new', 'old']);
  const text = serializeAllToTxt(projects, links, EXPORTED);
  assert.ok(text.indexOf('EARLIER') < text.indexOf('LATER'));
  assert.ok(text.indexOf('/new') < text.indexOf('/old'));
});
test('empty workspace exports', () => {
  assert.deepEqual(JSON.parse(serializeAllToJson([], [])).projects, []);
  assert.match(serializeAllToTxt([], []), /Projects: 0\nLinks: 0/);
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
  await service.exportAllAsJson();
  await service.exportAllAsTxt();
  assert.deepEqual(downloads.map((args) => args.slice(1)), [
    ['research-linkyard.json', 'application/json'], ['research-linkyard.txt', 'text/plain'],
    ['linkyard-all.json', 'application/json'], ['linkyard-all.txt', 'text/plain'],
  ]);
  await assert.rejects(service.exportProjectAsJson('missing'));
});
