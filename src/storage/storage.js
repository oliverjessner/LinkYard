import { STORAGE_KEYS } from '../constants.js';
import { normalizeUrl, getDomain, validateUrl } from '../utils/url.js';
import { validateProjectName, isTimestamp, optionalText } from '../utils/validation.js';

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200;
}

function readRecords(value, clean, label, report) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    report(`LinkYard: invalid ${label} storage; using an empty list.`);
    return [];
  }
  const ids = new Set();
  const records = [];
  for (const raw of value) {
    try {
      if (ids.has(raw?.id)) throw new Error('Duplicate record ID.');
      const record = clean(raw);
      ids.add(record.id);
      records.push(record);
    } catch {
      // Report the kind of damage without printing potentially private URLs.
      report(`LinkYard: skipped a damaged ${label} record.`);
    }
  }
  return records;
}

export function sanitizeWorkspace(raw = {}, report = console.error) {
  const projects = readRecords(raw[STORAGE_KEYS.PROJECTS], (project) => {
    if (!project || !validId(project.id) || !isTimestamp(project.createdAt) ||
        !isTimestamp(project.updatedAt)) throw new Error('Invalid project.');
    return {
      id: project.id,
      name: validateProjectName(project.name),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  }, 'project', report);

  const projectIds = new Set(projects.map((project) => project.id));
  const duplicates = new Set();
  const links = readRecords(raw[STORAGE_KEYS.LINKS], (link) => {
    if (!link || !validId(link.id) || !projectIds.has(link.projectId) ||
        !isTimestamp(link.createdAt)) throw new Error('Invalid link.');
    const url = validateUrl(link.url).href;
    const normalizedUrl = normalizeUrl(url);
    const duplicateKey = JSON.stringify([link.projectId, normalizedUrl]);
    if (duplicates.has(duplicateKey)) throw new Error('Duplicate URL.');
    duplicates.add(duplicateKey);
    const domain = getDomain(url);
    return {
      id: link.id,
      projectId: link.projectId,
      url,
      normalizedUrl,
      title: optionalText(link.title) || domain || url,
      sourceUrl: optionalText(link.sourceUrl),
      sourceTitle: optionalText(link.sourceTitle),
      domain,
      createdAt: link.createdAt,
      note: optionalText(link.note),
      tags: Array.isArray(link.tags) ? link.tags.filter((tag) => typeof tag === 'string') : [],
    };
  }, 'link', report);

  const activeId = raw[STORAGE_KEYS.SETTINGS]?.activeProjectId;
  return {
    projects,
    links,
    settings: { activeProjectId: projectIds.has(activeId) ? activeId : projects[0]?.id ?? null },
  };
}

export function createStorage(area) {
  return {
    async read() {
      return sanitizeWorkspace(await area.get(Object.values(STORAGE_KEYS)));
    },
    async save(workspace) {
      await area.set({
        [STORAGE_KEYS.PROJECTS]: workspace.projects,
        [STORAGE_KEYS.LINKS]: workspace.links,
        [STORAGE_KEYS.SETTINGS]: workspace.settings,
      });
    },
  };
}
