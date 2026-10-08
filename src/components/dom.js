export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const icons = {
  plus: 'plus',
  more: 'ellipsis',
  search: 'magnifying-glass',
  arrow: 'arrow-up-right-from-square',
  link: 'link',
  folder: 'folder',
  lock: 'lock',
  close: 'xmark',
};

export function icon(name, size = 16) {
  const node = element('i', `fa-solid fa-${icons[name] || icons.link}`);
  node.setAttribute('aria-hidden', 'true');
  node.style.fontSize = `${size}px`;
  return node;
}

export function iconButton(name, label, className = '') {
  const button = element('button', `oj-icon-button ${className}`.trim());
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.setAttribute('data-oj-tooltip', label);
  button.append(icon(name));
  return button;
}
