import { EXPORT_FORMAT, EXPORT_VERSION } from '../constants.js';
import { newestFirst } from '../utils/dates.js';
import { getProject } from './project-service.js';

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

export function serializeProjectToTxt(project, links) {
  return projectLinks(project, links).map((link) => link.url).join('\n');
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
    const project = getProject(workspace, projectId);
    const serializers = { json: serializeProjectToJson, txt: serializeProjectToTxt };
    const text = serializers[format](project, workspace.links);
    const filename = exportFilename(project.name, format);
    await download(text, filename, format === 'json' ? 'application/json' : 'text/plain');
    return filename;
  }
  return {
    exportProjectAsJson: (id) => exportData(id, 'json'),
    exportProjectAsTxt: (id) => exportData(id, 'txt'),
  };
}
