import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextMenuItems, createContextMenuService } from '../src/services/context-menu-service.js';
import { MENU_IDS } from '../src/constants.js';
import { workspace } from './fixtures.js';

test('empty workspace offers only New Project under LinkYard', () => {
  const items = buildContextMenuItems({ projects: [], settings: { activeProjectId: null } });
  assert.deepEqual(items.map((item) => item.id), [MENU_IDS.PROJECTS, MENU_IDS.NEW_PROJECT]);
});
test('quick capture and selected project labels reflect the active project', () => {
  const items = buildContextMenuItems(workspace());
  assert.equal(items[0].title, 'Add to "Research"');
  assert.equal(items.find((item) => item.id === `${MENU_IDS.PROJECT_PREFIX}p1`).title, '✓ Research');
  assert.ok(items.every((item) => item.contexts.length === 1 && item.contexts[0] === 'link'));
});
test('menu is cleared before each rebuild; concurrent rebuilds leave no orphan entries', async () => {
  let current = workspace();
  const menu = new Map();
  let removes = 0;
  const api = {
    runtime: { lastError: null },
    contextMenus: {
      removeAll(callback) { removes++; menu.clear(); queueMicrotask(callback); },
      create(properties, callback) { assert.equal(menu.has(properties.id), false); menu.set(properties.id, properties); queueMicrotask(callback); },
    },
  };
  const service = createContextMenuService(api, { read: async () => structuredClone(current) });
  await Promise.all([service.rebuildContextMenus(), service.rebuildContextMenus()]);
  assert.equal(removes, 1);
  current.projects[0].name = 'Renamed';
  current.settings.activeProjectId = 'p2';
  await service.rebuildContextMenus();
  assert.equal(menu.get(MENU_IDS.QUICK_ADD).title, 'Add to "Competitors"');
  assert.equal(menu.get(`${MENU_IDS.PROJECT_PREFIX}p1`).title, 'Renamed');
  current = { projects: [], settings: { activeProjectId: null } };
  await service.rebuildContextMenus();
  assert.equal(menu.has(MENU_IDS.QUICK_ADD), false);
  assert.equal(menu.size, 2);
});
test('menu creation errors are surfaced and a later rebuild can recover', async () => {
  let fail = true;
  const api = {
    runtime: { lastError: null },
    contextMenus: {
      removeAll(callback) { callback(); },
      create(properties, callback) {
        api.runtime.lastError = fail ? { message: 'Menu error' } : null;
        callback();
        api.runtime.lastError = null;
      },
    },
  };
  const service = createContextMenuService(api, { read: async () => workspace() });
  await assert.rejects(service.rebuildContextMenus(), /Menu error/);
  fail = false;
  await service.rebuildContextMenus();
});
