import { element, iconButton } from './dom.js';
import { getSourceDomain } from '../utils/url.js';
import { relativeDate } from '../utils/dates.js';
import { initTooltips } from '../vendor/oj-designsystem/index.js';

function createLinkItem(link, { onOpen, onBindMenu }) {
  const row = element('li', 'oj-list-item link-item');
  row.dataset.linkId = link.id;
  const monogram = element('span', 'domain-mark', (link.domain.replace(/^www\./, '')[0] || '↗').toUpperCase());
  monogram.setAttribute('aria-hidden', 'true');
  const content = element('div', 'link-content');
  const title = element('a', 'oj-link link-title', link.title);
  title.href = link.url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.title = link.url;
  title.addEventListener('click', (event) => { event.preventDefault(); onOpen(link.url); });
  const url = element('div', 'link-url oj-truncate oj-mono oj-small oj-muted', link.url);
  url.title = link.url;
  const metadata = element('div', 'link-metadata oj-small oj-muted');
  const time = element('time', null, relativeDate(link.createdAt));
  time.dateTime = link.createdAt;
  time.title = new Date(link.createdAt).toLocaleString();
  metadata.append(time);
  const sourceDomain = getSourceDomain(link.sourceUrl);
  if (sourceDomain) {
    const source = element('span', 'link-source', `via ${sourceDomain}`);
    source.title = link.sourceTitle || link.sourceUrl;
    const separator = element('span', null, '·');
    separator.setAttribute('aria-hidden', 'true');
    metadata.append(separator, source);
  }
  content.append(title, url, metadata);
  const menu = iconButton('more', `Actions for ${link.title}`, 'oj-icon-button link-menu-button');
  menu.dataset.ojTooltip = 'Link actions';
  row.append(monogram, content, menu);
  return { node: row, bind: () => {
    const unbind = onBindMenu(menu, link);
    const cleanupTooltips = initTooltips(row);
    return () => { cleanupTooltips(); unbind(); };
  } };
}

export function createLinkList(container, actions) {
  const rows = new Map();
  function render(links) {
    const ids = new Set(links.map((link) => link.id));
    for (const [id, entry] of rows) {
      if (!ids.has(id)) { entry.destroy(); entry.node.remove(); rows.delete(id); }
    }
    for (const [index, link] of links.entries()) {
      const fingerprint = JSON.stringify(link);
      let entry = rows.get(link.id);
      if (!entry || entry.fingerprint !== fingerprint) {
        const item = createLinkItem(link, actions);
        const { node } = item;
        entry?.destroy();
        entry?.node.replaceWith(node);
        if (!node.isConnected) container.insertBefore(node, container.children[index] || null);
        entry = { node, fingerprint, destroy: item.bind() };
        rows.set(link.id, entry);
      }
      entry.node.querySelector('time').textContent = relativeDate(link.createdAt);
      if (container.children[index] !== entry.node) container.insertBefore(entry.node, container.children[index] || null);
    }
  }
  render.destroy = () => {
    for (const entry of rows.values()) entry.destroy();
    rows.clear();
  };
  return render;
}
