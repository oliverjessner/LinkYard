import { validateProjectName } from '../utils/validation.js';

export function getProject(workspace, id) {
  const project = workspace.projects.find((candidate) => candidate.id === id);
  if (!project) throw new Error('This project no longer exists.');
  return project;
}

export function getProjects(workspace) {
  return [...workspace.projects];
}

export function createProject(workspace, name, { id = crypto.randomUUID(), now = new Date().toISOString() } = {}) {
  const project = { id, name: validateProjectName(name), createdAt: now, updatedAt: now };
  return {
    workspace: {
      ...workspace,
      projects: [...workspace.projects, project],
      settings: { activeProjectId: id },
    },
    project,
  };
}

export function renameProject(workspace, id, name, now = new Date().toISOString()) {
  getProject(workspace, id);
  const cleanName = validateProjectName(name);
  return {
    ...workspace,
    projects: workspace.projects.map((project) => project.id === id
      ? { ...project, name: cleanName, updatedAt: now } : project),
  };
}

export function deleteProject(workspace, id) {
  getProject(workspace, id);
  const index = workspace.projects.findIndex((project) => project.id === id);
  const projects = workspace.projects.filter((project) => project.id !== id);
  const activeProjectId = workspace.settings.activeProjectId === id
    ? projects[Math.min(index, projects.length - 1)]?.id ?? null
    : workspace.settings.activeProjectId;
  return {
    projects,
    links: workspace.links.filter((link) => link.projectId !== id),
    settings: { activeProjectId },
  };
}

export function setActiveProject(workspace, id) {
  getProject(workspace, id);
  return { ...workspace, settings: { activeProjectId: id } };
}
