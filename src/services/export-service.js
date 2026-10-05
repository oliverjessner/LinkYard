import { EXPORT_FORMAT, EXPORT_VERSION } from '../constants.js';
import { newestFirst, oldestFirst } from '../utils/dates.js';
import { getProject } from './project-service.js';

const RULE = '='.repeat(60);
const SEPARATOR = '-'.repeat(60);

function exportProject(project) {
  return { id: project.id, name: project.name, createdAt: project.createdAt, updatedAt: project.updatedAt };
}

function exportLink(link) {
  return {
    id: link.id,
    url: link.url,
    normalizedUrl: link.normalizedUrl,
    title: link.title || link.domain || link.url,
    domain: link.domain,
    sourceUrl: link.sourceUrl ?? null,
    sourceTitle: link.sourceTitle ?? null,
    createdAt: link.createdAt,
    note: link.note ?? null,
    tags: link.tags ?? [],
  };
}

function projectLinks(project, links) {
  return newestFirst(links.filter((link) => link.projectId === project.id));
}

function envelope(exportedAt) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt };
}

export function serializeProjectToJson(project, links, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    ...envelope(exportedAt),
    project: exportProject(project),
    links: projectLinks(project, links).map(exportLink),
  }, null, 2);
}

export function serializeAllToJson(projects, links, exportedAt = new Date().toISOString()) {
  return JSON.stringify({
    ...envelope(exportedAt),
    projects: oldestFirst(projects).map((project) => ({
      ...exportProject(project),
      links: projectLinks(project, links).map(exportLink),
    })),
  }, null, 2);
}

function linkText(link) {
  const lines = [link.title || link.domain || link.url, link.url, ''];
  if (link.sourceUrl) lines.push('Source:', link.sourceUrl, '');
  lines.push('Added:', link.createdAt);
  if (link.note) lines.push('', 'Note:', link.note);
  if (link.tags?.length) lines.push('', `Tags: ${link.tags.join(', ')}`);
  return [...lines, '', SEPARATOR, ''].join('\n');
}

export function serializeProjectToTxt(project, links, exportedAt = new Date().toISOString()) {
  const ordered = projectLinks(project, links);
  return [
    'LinkYard Export', `Project: ${project.name}`, `Exported: ${exportedAt}`,
    `Links: ${ordered.length}`, '', RULE, '', ...ordered.map(linkText), '',
  ].join('\n');
}

export function serializeAllToTxt(projects, links, exportedAt = new Date().toISOString()) {
  const ordered = oldestFirst(projects);
  const count = ordered.reduce((total, project) => total + projectLinks(project, links).length, 0);
  return [
    'LinkYard Export', `Exported: ${exportedAt}`, `Projects: ${ordered.length}`, `Links: ${count}`, '',
    ...ordered.flatMap((project) => {
      const items = projectLinks(project, links);
      return [RULE, project.name.toUpperCase(), `${items.length} links`, RULE, '', ...items.map(linkText), ''];
    }), '',
  ].join('\n');
}

export function exportFilename(name, extension) {
  if (!['json', 'txt'].includes(extension)) throw new Error('Unsupported export format.');
  const safe = String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '');
  return `${safe || 'project'}-linkyard.${extension}`;
}

export function createExportService(readWorkspace, download) {
  async function exportData(projectId, format) {
    const workspace = await readWorkspace();
    const project = projectId === null ? null : getProject(workspace, projectId);
    const serializers = project
      ? { json: serializeProjectToJson, txt: serializeProjectToTxt }
      : { json: serializeAllToJson, txt: serializeAllToTxt };
    const text = serializers[format](project || workspace.projects, workspace.links);
    const filename = project ? exportFilename(project.name, format) : `linkyard-all.${format}`;
    await download(text, filename, format === 'json' ? 'application/json' : 'text/plain');
    return filename;
  }
  return {
    exportProjectAsJson: (id) => exportData(id, 'json'),
    exportProjectAsTxt: (id) => exportData(id, 'txt'),
    exportAllAsJson: () => exportData(null, 'json'),
    exportAllAsTxt: () => exportData(null, 'txt'),
  };
}
