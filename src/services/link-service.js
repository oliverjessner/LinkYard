import { getProject } from './project-service.js';
import { validateUrl, normalizeUrl, getDomain } from '../utils/url.js';
import { optionalText } from '../utils/validation.js';
import { newestFirst } from '../utils/dates.js';

export function findDuplicate(workspace, projectId, normalizedUrl, exceptId = null) {
  return workspace.links.find((link) => link.projectId === projectId &&
    link.normalizedUrl === normalizedUrl && link.id !== exceptId) ?? null;
}

export function getLinksForProject(workspace, projectId, query = '') {
  const search = query.trim().toLowerCase();
  return newestFirst(workspace.links.filter((link) => link.projectId === projectId &&
    (!search || [link.title, link.url, link.normalizedUrl, link.domain, link.sourceTitle, link.sourceUrl]
      .some((value) => typeof value === 'string' && value.toLowerCase().includes(search)))));
}

function touchProjects(workspace, ids, now) {
  return workspace.projects.map((project) => ids.includes(project.id)
    ? { ...project, updatedAt: now } : project);
}

export function addLink(workspace, projectId, input, { id = crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  const project = getProject(workspace, projectId);
  const url = validateUrl(input?.url).href;
  const normalizedUrl = normalizeUrl(url);
  const duplicate = findDuplicate(workspace, projectId, normalizedUrl);
  if (duplicate) return { workspace, link: duplicate, duplicate: true, project };
  const domain = getDomain(url);
  const link = {
    id, projectId, url, normalizedUrl,
    title: optionalText(input.title) || domain || url,
    sourceUrl: optionalText(input.sourceUrl),
    sourceTitle: optionalText(input.sourceTitle),
    domain, createdAt: now, note: null, tags: [],
  };
  return {
    workspace: {
      ...workspace,
      projects: touchProjects(workspace, [projectId], now),
      links: [...workspace.links, link],
    },
    link, duplicate: false, project,
  };
}

export function deleteLink(workspace, id, now = new Date().toISOString()) {
  const link = workspace.links.find((candidate) => candidate.id === id);
  if (!link) throw new Error('This link no longer exists.');
  return {
    ...workspace,
    projects: touchProjects(workspace, [link.projectId], now),
    links: workspace.links.filter((candidate) => candidate.id !== id),
  };
}

export function moveLink(workspace, id, targetProjectId, now = new Date().toISOString()) {
  const project = getProject(workspace, targetProjectId);
  const link = workspace.links.find((candidate) => candidate.id === id);
  if (!link) throw new Error('This link no longer exists.');
  const duplicate = findDuplicate(workspace, targetProjectId, link.normalizedUrl, id);
  if (duplicate) return { workspace, duplicate: true, project };
  if (link.projectId === targetProjectId) return { workspace, duplicate: false, project };
  return {
    workspace: {
      ...workspace,
      projects: touchProjects(workspace, [link.projectId, targetProjectId], now),
      links: workspace.links.map((candidate) => candidate.id === id
        ? { ...candidate, projectId: targetProjectId } : candidate),
    },
    duplicate: false, project,
  };
}
