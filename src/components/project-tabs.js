import { element } from './dom.js';

export function createProjectTabs(container, onSelect) {
  let fingerprint = '';
  container.addEventListener('keydown', (event) => {
    const tabs = [...container.querySelectorAll('[role="tab"]')];
    const current = tabs.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); tabs[next]?.focus(); }
  });

  return function render(projects, links, activeId) {
    const counts = new Map();
    for (const link of links) counts.set(link.projectId, (counts.get(link.projectId) || 0) + 1);
    const next = JSON.stringify([projects.map(({ id, name }) => [id, name, counts.get(id) || 0]), activeId]);
    if (next === fingerprint) return;
    const focusedId = container.contains(document.activeElement) ? document.activeElement.dataset.projectId : null;
    const previousActive = container.querySelector('[aria-selected="true"]')?.dataset.projectId;
    fingerprint = next;
    const fragment = document.createDocumentFragment();
    for (const project of projects) {
      const active = project.id === activeId;
      const tab = element('button', 'project-tab');
      tab.type = 'button';
      tab.id = `project-tab-${project.id}`;
      tab.dataset.projectId = project.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('aria-controls', 'project-panel');
      tab.tabIndex = active ? 0 : -1;
      tab.title = project.name;
      tab.append(element('span', 'tab-name', project.name), element('span', 'tab-count', counts.get(project.id) || 0));
      tab.addEventListener('click', () => onSelect(project.id));
      fragment.append(tab);
    }
    container.replaceChildren(fragment);
    for (const tab of container.children) {
      if (tab.dataset.projectId === focusedId) tab.focus({ preventScroll: true });
      if (previousActive !== activeId && tab.dataset.projectId === activeId) {
        tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  };
}
