import { initTabs } from '../vendor/oj-designsystem/index.js';
import { element } from './dom.js';

export function createProjectTabs(container, panelsContainer, onSelect) {
  const scope = container.closest('[data-oj-tabs]');
  const content = panelsContainer.querySelector('#project-panel');
  const ownerDocument = container.ownerDocument;
  let cleanupTabs = () => {};
  let panelsByProject = new Map();
  let fingerprint = '';
  let destroyed = false;

  function onChange(event) {
    const { tab, panel } = event.detail || {};
    const id = tab?.dataset.projectId;
    if (!tab || !container.contains(tab) || panelsByProject.get(id) !== panel) return;
    // OJ reveals the selected wrapper before dispatching. Move the shared
    // workspace into it immediately, while the persisted selection refreshes.
    panel.append(content);
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    onSelect(id);
  }
  scope.addEventListener('oj:change', onChange);

  function render(projects, links, activeId) {
    if (destroyed) return;
    const counts = new Map();
    for (const link of links) counts.set(link.projectId, (counts.get(link.projectId) || 0) + 1);
    const next = JSON.stringify([projects.map(({ id, name }) => [id, name, counts.get(id) || 0]), activeId]);
    if (next === fingerprint) return;
    const focusedElement = ownerDocument.activeElement;
    const focusedId = container.contains(focusedElement) ? focusedElement.dataset.projectId : null;
    const focusedPanelId = panelsContainer.contains(focusedElement) && focusedElement?.getAttribute('role') === 'tabpanel'
      ? focusedElement.dataset.projectId : null;
    const focusedContent = content.contains(focusedElement) ? focusedElement : null;
    const previousActive = container.querySelector('[aria-selected="true"]')?.dataset.projectId;
    const scrollLeft = container.scrollLeft;
    const selectedId = projects.find((project) => project.id === activeId)?.id ?? projects[0]?.id;
    // initTabs keeps references to its original tab/panel nodes. Release that
    // ownership before replacing them so the next initialization finds updates.
    cleanupTabs();
    fingerprint = next;
    const tabs = ownerDocument.createDocumentFragment();
    const panels = ownerDocument.createDocumentFragment();
    const tabsByProject = new Map();
    panelsByProject = new Map();
    for (const project of projects) {
      const active = project.id === selectedId;
      const tab = element('button', 'oj-tab project-tab');
      tab.type = 'button';
      tab.id = `project-tab-${project.id}`;
      tab.dataset.projectId = project.id;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(active));
      tab.setAttribute('aria-controls', `project-panel-${project.id}`);
      tab.tabIndex = active ? 0 : -1;
      tab.title = project.name;
      tab.append(element('span', 'tab-name', project.name), element('span', 'oj-badge oj-mono tab-count', counts.get(project.id) || 0));
      tabs.append(tab);
      tabsByProject.set(project.id, tab);

      const panel = element('div', 'oj-tab-panel project-tab-panel');
      panel.id = `project-panel-${project.id}`;
      panel.dataset.projectId = project.id;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.hidden = !active;
      panels.append(panel);
      panelsByProject.set(project.id, panel);
    }

    // Keep the consumer-owned section in the document even without projects.
    (panelsByProject.get(selectedId) || panels).append(content);
    container.replaceChildren(tabs);
    panelsContainer.replaceChildren(panels);
    cleanupTabs = initTabs(scope);
    container.scrollLeft = scrollLeft;

    if (focusedId) {
      (tabsByProject.get(focusedId) || tabsByProject.get(selectedId))?.focus({ preventScroll: true });
    } else if (focusedContent?.isConnected && !content.hidden) {
      focusedContent.focus({ preventScroll: true });
    } else if (focusedPanelId) {
      panelsByProject.get(selectedId)?.focus({ preventScroll: true });
    }
    if (previousActive !== selectedId) {
      tabsByProject.get(selectedId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  render.destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cleanupTabs();
    scope.removeEventListener('oj:change', onChange);
  };
  return render;
}
