import test from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS, MENU_IDS, MESSAGE_TYPES, SESSION_KEYS } from '../src/constants.js';

function event() {
  const listeners = [];
  return { listeners, addListener: (listener) => listeners.push(listener), removeListener: () => {} };
}

test('background routes real commands and captures through registered Chrome event handlers', async (t) => {
  const local = {};
  const session = {};
  const menuItems = new Map();
  const opened = [];
  const badges = [];
  const storageChanges = event();
  const api = {
    storage: {
      onChanged: storageChanges,
      local: {
        get: async () => structuredClone(local),
        set: async (value) => {
          const changes = {};
          for (const [key, next] of Object.entries(value)) {
            if (JSON.stringify(local[key]) !== JSON.stringify(next)) changes[key] = { newValue: next };
            local[key] = structuredClone(next);
          }
          for (const listener of storageChanges.listeners) listener(changes, 'local');
        },
      },
      session: {
        get: async () => structuredClone(session),
        set: async (values) => { Object.assign(session, structuredClone(values)); },
        remove: async (key) => { delete session[key]; },
      },
    },
    runtime: {
      id: 'test-extension', lastError: null, onInstalled: event(), onStartup: event(), onMessage: event(),
      sendMessage: async () => {},
    },
    sidePanel: {
      setPanelBehavior: async (options) => assert.equal(options.openPanelOnActionClick, true),
      open: (options) => { opened.push(options); return Promise.resolve(); },
    },
    contextMenus: {
      onClicked: event(),
      removeAll: (callback) => { menuItems.clear(); callback(); },
      create: (properties, callback) => { menuItems.set(properties.id, properties); callback(); },
    },
    action: {
      setBadgeText: async (value) => { badges.push(value); },
      setTitle: async () => {}, setBadgeBackgroundColor: async () => {},
    },
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.chrome = api;
  t.after(() => { delete globalThis.chrome; });
  await import('../src/background/service-worker.js');

  const handler = api.runtime.onMessage.listeners[0];
  function send(command, payload = {}) {
    return new Promise((resolve, reject) => {
      const keptAlive = handler({ type: MESSAGE_TYPES.COMMAND, command, payload }, { id: api.runtime.id }, (response) => {
        if (response.ok) resolve(response.result);
        else reject(new Error(response.error));
      });
      assert.equal(keptAlive, true);
    });
  }
  assert.equal(handler({ type: MESSAGE_TYPES.COMMAND, command: COMMANDS.GET_WORKSPACE }, { id: 'another-extension' }, () => {}), false);
  const created = await send(COMMANDS.CREATE_PROJECT, { name: 'Research' });
  assert.equal(menuItems.get(MENU_IDS.QUICK_ADD).title, 'Add to "Research"');

  api.contextMenus.onClicked.listeners[0]({
    menuItemId: MENU_IDS.QUICK_ADD, linkUrl: 'https://example.com/article/#comments', pageUrl: 'https://reddit.com/r/example',
  }, { id: 7, windowId: 1, title: 'Discussion' });
  const first = await send(COMMANDS.GET_WORKSPACE);
  assert.equal(first.workspace.links.length, 1);
  assert.equal(first.workspace.links[0].projectId, created.project.id);
  assert.equal(first.workspace.links[0].sourceUrl, 'https://reddit.com/r/example');
  assert.equal(first.workspace.links[0].sourceTitle, 'Discussion');

  api.contextMenus.onClicked.listeners[0]({ menuItemId: MENU_IDS.QUICK_ADD, linkUrl: 'https://example.com/article' }, { id: 7 });
  assert.equal((await send(COMMANDS.GET_WORKSPACE)).workspace.links.length, 1);

  api.contextMenus.onClicked.listeners[0]({ menuItemId: MENU_IDS.NEW_PROJECT, linkUrl: 'https://example.com/new', pageUrl: 'https://source.test' }, { id: 7, windowId: 1 });
  assert.deepEqual(opened, [{ windowId: 1 }]);
  const { pending } = await send(COMMANDS.TAKE_PENDING_CAPTURE);
  assert.equal(pending.input.url, 'https://example.com/new');
  assert.equal(session[SESSION_KEYS.PENDING_CAPTURE], undefined);
  assert.equal((await send(COMMANDS.TAKE_PENDING_CAPTURE)).pending, null);

  session[SESSION_KEYS.PENDING_CAPTURE] = { input: { url: 'https://example.com/stale' }, createdAt: Date.now() - 10 * 60 * 1000 };
  assert.equal((await send(COMMANDS.TAKE_PENDING_CAPTURE)).pending, null);
  await send(COMMANDS.RENAME_PROJECT, { id: created.project.id, name: 'Renamed' });
  assert.equal(menuItems.get(MENU_IDS.QUICK_ADD).title, 'Add to "Renamed"');
  await send(COMMANDS.DELETE_PROJECT, { id: created.project.id });
  assert.equal(menuItems.has(MENU_IDS.QUICK_ADD), false);
  assert.equal((await send(COMMANDS.GET_WORKSPACE)).workspace.links.length, 0);
  assert.ok(badges.some((entry) => entry.text === '✓'));
  assert.ok(badges.some((entry) => entry.text === '='));
});
