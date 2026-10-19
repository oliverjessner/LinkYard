import { MAX_PAGE_LINKS, MAX_PAGE_LINK_BYTES } from '../constants.js';
import { validateUrl } from '../utils/url.js';
import { optionalText } from '../utils/validation.js';
import { addLinks } from './link-service.js';

export function addExternalPageLinks(workspace, projectId, capture, now) {
  const sourceUrl = validateUrl(capture?.sourceUrl);
  if (!Array.isArray(capture.links) || capture.links.length > MAX_PAGE_LINKS ||
      new TextEncoder().encode(JSON.stringify(capture.links)).byteLength > MAX_PAGE_LINK_BYTES) {
    throw new Error('This page contains too much link data. Try a smaller page.');
  }
  const sourceHost = sourceUrl.hostname.replace(/^www\./, '');
  const inputs = [];
  let skipped = 0;
  for (const input of capture.links) {
    try {
      const url = validateUrl(input?.url);
      if (url.hostname.replace(/^www\./, '') === sourceHost) { skipped += 1; continue; }
      inputs.push({
        url: url.href, title: optionalText(input.title)?.slice(0, 500),
        sourceUrl: sourceUrl.href, sourceTitle: optionalText(capture.sourceTitle)?.slice(0, 500),
      });
    } catch { skipped += 1; }
  }
  return { ...addLinks(workspace, projectId, inputs, now), skipped, truncated: capture.truncated === true };
}
