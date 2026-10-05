import { element, iconButton } from './dom.js';
import { getSourceDomain } from '../utils/url.js';
import { relativeDate } from '../utils/dates.js';

function createLinkItem(link, { onOpen, onMenu }) {
  const row = element('li', 'link-item');
  const monogram = element('span', 'domain-mark', (link.domain.replace(/^www\./, '')[0] || '↗').toUpperCase());
  monogram.setAttribute('aria-hidden', 'true');
  const content = element('div', 'link-content');
  const title = element('a', 'link-title', link.title);
  title.href = link.url;
  title.target = '_blank';
  title.rel = 'noopener noreferrer';
  title.title = link.url;
  title.addEventListener('click', (event) => { event.preventDefault(); onOpen(link.url); });
  const domain = element('div', 'link-domain', link.domain);
  const metadata = element('div', 'link-metadata');
  const time = element('time', null, relativeDate(link.createdAt));
  time.dateTime = link.createdAt;
  time.title = new Date(link.createdAt).toLocaleString();
  metadata.append(time);
  const sourceDomain = getSourceDomain(link.sourceUrl);
  if (sourceDomain) {
    const source = element('span', 'link-source', `via ${sourceDomain}`);
    source.title = link.sourceTitle || link.sourceUrl;
    metadata.append(element('span', 'metadata-dot', '·'), source);
  }
  content.append(title, domain, metadata);
  const menu = iconButton('more', `Actions for ${link.title}`, 'icon-button link-menu-button');
  menu.setAttribute('aria-haspopup', 'menu');
  menu.setAttribute('aria-expanded', 'false');
  menu.addEventListener('click', () => onMenu(menu, link));
  row.append(monogram, content, menu);
  return row;
}

export function createLinkList(container, actions) {
  const rows = new Map();
  return function render(links) {
    const ids = new Set(links.map((link) => link.id));
    for (const [id, entry] of rows) {
      if (!ids.has(id)) { entry.node.remove(); rows.delete(id); }
    }
    for (const [index, link] of links.entries()) {
      const fingerprint = JSON.stringify(link);
      let entry = rows.get(link.id);
      if (!entry || entry.fingerprint !== fingerprint) {
        const node = createLinkItem(link, actions);
        entry?.node.replaceWith(node);
        entry = { node, fingerprint };
        rows.set(link.id, entry);
      }
      entry.node.querySelector('time').textContent = relativeDate(link.createdAt);
      if (container.children[index] !== entry.node) container.insertBefore(entry.node, container.children[index] || null);
    }
  };
}
