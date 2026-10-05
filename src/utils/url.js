export function validateUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Enter a valid http:// or https:// URL.');
  }
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a valid http:// or https:// URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http:// and https:// links are supported.');
  }
  if (url.username || url.password) {
    throw new Error('URLs containing login credentials are not supported.');
  }
  return url;
}

export function normalizeUrl(value) {
  const url = validateUrl(value);
  url.hash = '';
  // Keep queries intact; only trailing path slashes are treated as equivalent.
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.href;
}

export function getDomain(value) {
  return validateUrl(value).hostname;
}

export function getSourceDomain(value) {
  if (!value) return null;
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}
