import { element } from './dom.js';

export function createDropdown(container) {
  let trigger = null;

  function close(restoreFocus = true) {
    container.hidden = true;
    container.replaceChildren();
    trigger?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && trigger?.isConnected) trigger.focus();
    trigger = null;
  }

  function enabledItems() {
    return [...container.querySelectorAll('button:not(:disabled)')];
  }

  function open(button, actions) {
    if (trigger === button && !container.hidden) return close();
    close(false);
    trigger = button;
    button.setAttribute('aria-expanded', 'true');
    container.replaceChildren();
    for (const action of actions) {
      if (action.separator) {
        const rule = element('div', 'menu-separator');
        rule.setAttribute('role', 'separator');
        container.append(rule);
      } else if (action.heading) {
        const heading = element('div', 'menu-heading', action.heading);
        heading.setAttribute('role', 'presentation');
        container.append(heading);
      } else {
        const item = element('button', `menu-item${action.danger ? ' danger' : ''}`, action.label);
        item.type = 'button';
        item.setAttribute('role', 'menuitem');
        item.disabled = Boolean(action.disabled);
        item.addEventListener('click', () => { close(); action.onSelect(); });
        container.append(item);
      }
    }
    container.hidden = false;
    const rect = button.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - container.offsetWidth, window.innerWidth - container.offsetWidth - 8));
    const top = Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - container.offsetHeight - 8));
    container.style.left = `${left}px`;
    container.style.top = `${top}px`;
    enabledItems()[0]?.focus();
  }

  container.addEventListener('keydown', (event) => {
    const items = enabledItems();
    const current = items.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next !== undefined) { event.preventDefault(); items[next]?.focus(); }
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') close();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!container.hidden && !container.contains(event.target) && !trigger?.contains(event.target)) close(false);
  });
  window.addEventListener('resize', () => close(false));
  document.addEventListener('scroll', () => close(false), true);
  return { open, close };
}
