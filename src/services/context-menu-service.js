import { MENU_IDS } from '../constants.js';

export function buildContextMenuItems(workspace) {
  const active = workspace.projects.find((project) => project.id === workspace.settings.activeProjectId);
  const contexts = ['link'];
  const targetUrlPatterns = ['http://*/*', 'https://*/*'];
  const items = [];
  if (active) items.push({
    id: MENU_IDS.QUICK_ADD, title: `Add to "${active.name}"`, contexts, targetUrlPatterns,
  });
  items.push({ id: MENU_IDS.PROJECTS, title: 'Add to LinkYard', contexts, targetUrlPatterns });
  for (const project of workspace.projects) items.push({
    id: `${MENU_IDS.PROJECT_PREFIX}${project.id}`,
    parentId: MENU_IDS.PROJECTS,
    title: `${project.id === active?.id ? '✓ ' : ''}${project.name}`,
    contexts, targetUrlPatterns,
  });
  if (workspace.projects.length) items.push({
    id: MENU_IDS.SEPARATOR, parentId: MENU_IDS.PROJECTS, type: 'separator', contexts,
  });
  items.push({
    id: MENU_IDS.NEW_PROJECT, parentId: MENU_IDS.PROJECTS,
    title: 'New Project…', contexts, targetUrlPatterns,
  });
  return items;
}

export function createContextMenuService(api, workspaceService) {
  let tail = Promise.resolve();
  let fingerprint = null;

  function createItem(properties) {
    return new Promise((resolve, reject) => {
      api.contextMenus.create(properties, () => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function removeAll() {
    return new Promise((resolve, reject) => {
      api.contextMenus.removeAll(() => {
        const error = api.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function rebuildContextMenus() {
    const result = tail.then(async () => {
      const items = buildContextMenuItems(await workspaceService.read());
      const nextFingerprint = JSON.stringify(items);
      if (nextFingerprint === fingerprint) return;
      fingerprint = null;
      await removeAll();
      for (const item of items) await createItem(item);
      fingerprint = nextFingerprint;
    });
    tail = result.catch(() => {});
    return result;
  }

  return { rebuildContextMenus };
}
