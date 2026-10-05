export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const paths = {
  plus: 'M8 3v10M3 8h10',
  more: 'M3 8h.01M8 8h.01M13 8h.01',
  search: 'M11 11l3 3M12 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  arrow: 'M4 12l8-8M4 4h8v8',
  link: 'M6.5 9.5l3-3M5.5 11.5l-1 1a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4 0M10.5 4.5l1-1a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 0',
  folder: 'M2 4h4l2 2h6v7H2z',
  lock: 'M4 7V5a4 4 0 0 1 8 0v2M3 7h10v7H3zM8 10v1',
  close: 'M4 4l8 8M12 4l-8 8',
};

export function icon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', name === 'more' ? '2.8' : '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('d', paths[name] || paths.link);
  svg.append(path);
  return svg;
}

export function iconButton(name, label, className = 'icon-button') {
  const button = element('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.append(icon(name));
  return button;
}
