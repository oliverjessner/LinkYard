import { MAX_TXT_IMPORT_BYTES, MAX_TXT_IMPORT_LINES } from '../constants.js';
import { validateUrl } from '../utils/url.js';
import { addLinks } from './link-service.js';

export function importProjectFromTxt(workspace, projectId, text, now) {
  if (typeof text !== 'string') throw new Error('Choose a UTF-8 TXT file.');
  if (new TextEncoder().encode(text).byteLength > MAX_TXT_IMPORT_BYTES) {
    throw new Error('TXT files can be up to 1 MB.');
  }
  const lines = text.split(/\r\n|\n|\r/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('This TXT file contains no links.');
  if (lines.length > MAX_TXT_IMPORT_LINES) {
    throw new Error('TXT files can contain up to 10,000 non-empty lines.');
  }
  const inputs = [];
  let invalid = 0;
  for (const line of lines) {
    try {
      if (/[\s\u0000-\u001f\u007f]/u.test(line)) throw new Error('One URL per line.');
      inputs.push({ url: validateUrl(line).href });
    } catch {
      invalid += 1;
    }
  }
  return { ...addLinks(workspace, projectId, inputs, now), invalid };
}
