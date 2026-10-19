import { MESSAGE_TYPES, COMMANDS, STORAGE_KEYS, SESSION_KEYS, MAX_PAGE_LINKS, MAX_PAGE_LINK_BYTES } from '../constants.js';
import { validateUrl } from '../utils/url.js';
import { extractExternalPageLinks } from '../utils/page-links.js';

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

export async function openLink(url, { active = true } = {}) {
  await chrome.tabs.create({ url: validateUrl(url).href, active });
}

export async function collectActiveTabLinks() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) throw new Error('No active browser tab was found. Open a web page and try again.');
  const accessMessage = 'Click the LinkYard toolbar icon on this page, then try collecting again. Chrome does not allow collection from protected pages such as its settings or the Chrome Web Store.';
  if (!tab.url) throw new Error(accessMessage);
  let url;
  try { url = validateUrl(tab.url); } catch { throw new Error('Open an HTTP/HTTPS web page to collect external links.'); }
  if (url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'))) {
    throw new Error('Chrome does not allow collection from the Chrome Web Store. Open another web page.');
  }
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id }, world: 'ISOLATED',
      func: extractExternalPageLinks, args: [{ maxLinks: MAX_PAGE_LINKS, maxBytes: MAX_PAGE_LINK_BYTES }],
    });
  } catch { throw new Error(accessMessage); }
  const capture = results?.find((result) => result.frameId === 0)?.result;
  if (!capture || !Array.isArray(capture.links)) throw new Error('Could not read links from this page. Reload the page and try again.');
  return capture;
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
