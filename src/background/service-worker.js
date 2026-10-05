import {
  STORAGE_KEYS, MESSAGE_TYPES, COMMANDS, MENU_IDS,
} from '../constants.js';
import { createStorage } from '../storage/storage.js';
import { createPendingCaptureStorage } from '../storage/pending-capture.js';
import { createWorkspaceService } from '../services/workspace-service.js';
import { createContextMenuService } from '../services/context-menu-service.js';

const workspaceService = createWorkspaceService(createStorage(chrome.storage.local));
const pendingCaptures = createPendingCaptureStorage(chrome.storage.session);
const { rebuildContextMenus } = createContextMenuService(chrome, workspaceService);
const projectCommands = new Set([
  COMMANDS.CREATE_PROJECT, COMMANDS.RENAME_PROJECT, COMMANDS.DELETE_PROJECT, COMMANDS.SET_ACTIVE_PROJECT,
]);

function report(error) {
  console.error('LinkYard:', error);
}

async function configure() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.action.setBadgeText({ text: '' });
  await rebuildContextMenus();
}

chrome.runtime.onInstalled.addListener(() => { configure().catch(report); });
chrome.runtime.onStartup.addListener(() => { configure().catch(report); });

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message?.type !== MESSAGE_TYPES.COMMAND) return false;
  const operation = message.command === COMMANDS.TAKE_PENDING_CAPTURE
    ? pendingCaptures.take().then((pending) => ({ pending }))
    : workspaceService.execute(message.command, message.payload);
  operation.then(async (result) => {
    if (projectCommands.has(message.command)) await rebuildContextMenus();
    respond({ ok: true, result });
  }).catch((error) => {
    report(error);
    respond({ ok: false, error: error.message || 'Something went wrong. Please try again.' });
  });
  // Keep the message channel alive for asynchronous storage writes.
  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (STORAGE_KEYS.PROJECTS in changes || STORAGE_KEYS.SETTINGS in changes)) {
    rebuildContextMenus().catch(report);
  }
});

async function feedback(message, tabId, kind = 'success') {
  const options = Number.isInteger(tabId) ? { tabId } : {};
  await chrome.action.setBadgeBackgroundColor({ ...options, color: kind === 'error' ? '#a84141' : '#46694b' });
  await chrome.action.setBadgeText({ ...options, text: kind === 'duplicate' ? '=' : kind === 'error' ? '!' : '✓' });
  await chrome.action.setTitle({ ...options, title: message });
  // There usually is no open panel; a missing receiver is expected.
  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.FEEDBACK, message }).catch(() => {});
  setTimeout(() => {
    Promise.all([
      chrome.action.setBadgeText({ ...options, text: '' }),
      chrome.action.setTitle({ ...options, title: 'Open LinkYard' }),
    ]).catch(report);
  }, 2200);
}

function captureInput(info, tab) {
  return {
    url: info.linkUrl,
    sourceUrl: info.pageUrl || null,
    sourceTitle: tab?.title || null,
  };
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_IDS.NEW_PROJECT) {
    // Open synchronously inside the gesture; awaiting storage first loses it.
    const options = Number.isInteger(tab?.windowId) ? { windowId: tab.windowId }
      : Number.isInteger(tab?.id) ? { tabId: tab.id } : null;
    if (!options) { report(new Error('No browser window is available to open LinkYard.')); return; }
    const opening = chrome.sidePanel.open(options);
    const saving = pendingCaptures.save(captureInput(info, tab));
    Promise.all([opening, saving]).catch(report);
    return;
  }
  const menuId = String(info.menuItemId);
  const projectId = menuId === MENU_IDS.QUICK_ADD ? null
    : menuId.startsWith(MENU_IDS.PROJECT_PREFIX) ? menuId.slice(MENU_IDS.PROJECT_PREFIX.length) : undefined;
  if (projectId === undefined) return;
  workspaceService.execute(COMMANDS.ADD_LINK, { projectId, input: captureInput(info, tab) })
    .then((result) => feedback(
      `${result.duplicate ? 'Already in' : 'Added to'} ${result.project.name}`,
      tab?.id, result.duplicate ? 'duplicate' : 'success',
    )).catch((error) => {
      report(error);
      feedback(error.message, tab?.id, 'error').catch(report);
    });
});
