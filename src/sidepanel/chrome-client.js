import { MESSAGE_TYPES, COMMANDS, STORAGE_KEYS, SESSION_KEYS } from '../constants.js';
import { validateUrl } from '../utils/url.js';

export async function command(name, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.COMMAND, command: name, payload });
  if (!response?.ok) throw new Error(response?.error || 'LinkYard could not connect. Reload the extension and try again.');
  return response.result;
}

export async function readWorkspace() {
  return (await command(COMMANDS.GET_WORKSPACE)).workspace;
}

export function getVersion() {
  return chrome.runtime.getManifest().version;
}

export async function openLink(url) {
  await chrome.tabs.create({ url: validateUrl(url).href });
}

export function subscribe({ onWorkspaceChange, onFeedback, onPendingCapture }) {
  function onStorage(changes, area) {
    if (area === 'local' && Object.values(STORAGE_KEYS).some((key) => key in changes)) onWorkspaceChange();
    if (area === 'session' && changes[SESSION_KEYS.PENDING_CAPTURE]?.newValue) onPendingCapture();
  }
  function onMessage(message) {
    if (message?.type === MESSAGE_TYPES.FEEDBACK) onFeedback(message.message);
  }
  chrome.storage.onChanged.addListener(onStorage);
  chrome.runtime.onMessage.addListener(onMessage);
  return () => {
    chrome.storage.onChanged.removeListener(onStorage);
    chrome.runtime.onMessage.removeListener(onMessage);
  };
}
