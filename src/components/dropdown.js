import { initDropdowns } from '../vendor/oj-designsystem/index.js';
import { element } from './dom.js';

export function createDropdown(container) {
  const entries = new Map();
  const placeholder = container ? document.createComment('LinkYard action menu') : null;
  if (container?.parentNode) container.before(placeholder);
  let sharedAvailable = Boolean(container);
  let destroyed = false;

  function closeEntry(entry, restoreFocus = false) {
    if (entry.menu.hidden) return;
    // The public OJ cleanup closes without taking focus and allows reinitialization.
    entry.cleanup();
    entry.cleanup = initDropdowns(entry.wrapper);
    if (restoreFocus && entry.button.isConnected) entry.button.focus({ preventScroll: true });
  }

  function close(restoreFocus = true) {
    for (const entry of entries.values()) closeEntry(entry, restoreFocus);
  }

  function bind(button, getActions) {
    if (destroyed) return () => {};
    if (entries.has(button)) return entries.get(button).unbind;
    const parent = button.parentElement;
    const createdWrapper = !parent?.matches('[data-oj-dropdown]');
    const wrapper = createdWrapper ? element('div', 'oj-dropdown') : parent;
    if (createdWrapper) {
      wrapper.setAttribute('data-oj-dropdown', '');
      button.replaceWith(wrapper);
      wrapper.append(button);
    }
    const triggerAttribute = button.getAttribute('data-oj-dropdown-trigger');
    button.setAttribute('data-oj-dropdown-trigger', '');
    const shared = sharedAvailable;
    const menu = shared ? container : element('div', 'oj-menu');
    sharedAvailable = false;
    menu.classList.add('oj-menu');
    menu.setAttribute('data-oj-dropdown-menu', '');
    menu.setAttribute('aria-label', button.getAttribute('aria-label') || 'Actions');
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    wrapper.append(menu);
    const callbacks = new Map();
    const entry = { button, wrapper, menu, cleanup: null, unbind: null };

    function prepare(event) {
      if (event.type === 'keydown' && !['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) return;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      if (!menu.hidden) return;
      for (const other of entries.values()) {
        if (other !== entry) closeEntry(other);
      }
      callbacks.clear();
      const fragment = document.createDocumentFragment();
      for (const action of getActions() || []) {
        if (action.separator) {
          const divider = element('hr', 'oj-menu-divider');
          divider.setAttribute('role', 'separator');
          fragment.append(divider);
        } else if (action.heading) {
          const heading = element('div', 'oj-kicker menu-heading', action.heading);
          heading.setAttribute('role', 'presentation');
          fragment.append(heading);
        } else {
          const item = element('button', `oj-menu-item${action.danger ? ' oj-menu-item-danger' : ''}`, action.label);
          item.type = 'button';
          item.setAttribute('role', 'menuitem');
          item.tabIndex = -1;
          item.disabled = Boolean(action.disabled);
          callbacks.set(item, action.onSelect);
          fragment.append(item);
        }
      }
      menu.replaceChildren(fragment);
    }

    function select(event) {
      if (event.target !== wrapper || !callbacks.has(event.detail.item)) return;
      const callback = callbacks.get(event.detail.item);
      // OJ closes and restores the trigger first, so a modal retains its own focus.
      queueMicrotask(() => { if (!event.defaultPrevented && !destroyed) callback?.(); });
    }

    button.addEventListener('click', prepare, true);
    button.addEventListener('keydown', prepare, true);
    wrapper.addEventListener('oj:select', select);
    entry.cleanup = initDropdowns(wrapper);
    let unbound = false;
    entry.unbind = () => {
      if (unbound) return;
      unbound = true;
      entry.cleanup();
      button.removeEventListener('click', prepare, true);
      button.removeEventListener('keydown', prepare, true);
      wrapper.removeEventListener('oj:select', select);
      if (triggerAttribute === null) button.removeAttribute('data-oj-dropdown-trigger');
      else button.setAttribute('data-oj-dropdown-trigger', triggerAttribute);
      entries.delete(button);
      callbacks.clear();
      menu.replaceChildren();
      menu.hidden = true;
      if (shared) {
        if (placeholder?.parentNode) placeholder.after(menu);
        else menu.remove();
        sharedAvailable = true;
      } else menu.remove();
      if (createdWrapper && wrapper.contains(button)) wrapper.replaceWith(button);
    };
    entries.set(button, entry);
    return entry.unbind;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const entry of [...entries.values()]) entry.unbind();
    placeholder?.remove();
  }

  return { bind, close, destroy };
}
