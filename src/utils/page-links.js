// Chrome copies this function into an isolated world in the active tab. Keep it
// self-contained: imported helpers and surrounding variables are unavailable.
export function extractExternalPageLinks({ maxLinks, maxBytes }) {
  const sourceUrl = location.href;
  const sourceTitle = document.title.slice(0, 500);
  const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, '');
  const links = [];
  const encoder = new TextEncoder();
  let bytes = 2;
  let truncated = false;
  for (const anchor of document.querySelectorAll('a[href], area[href]')) {
    let url;
    try { url = new URL(anchor.getAttribute('href'), document.baseURI); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.hostname.replace(/^www\./, '') === sourceHost) continue;
    const title = (anchor.textContent.trim() || anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') || anchor.querySelector('img[alt]')?.getAttribute('alt') || '')
      .replace(/\s+/g, ' ').trim().slice(0, 500);
    const input = { url: url.href, title };
    const size = encoder.encode(JSON.stringify(input)).byteLength + (links.length ? 1 : 0);
    if (links.length >= maxLinks || bytes + size > maxBytes) { truncated = true; break; }
    links.push(input);
    bytes += size;
  }
  return { sourceUrl, sourceTitle, links, truncated };
}
