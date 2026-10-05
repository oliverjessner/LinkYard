import { COMMANDS, MAX_PROJECT_NAME } from '../constants.js';
import { command, readWorkspace, getVersion, openLink, subscribe } from './chrome-client.js';
import { createProjectTabs } from '../components/project-tabs.js';
import { createLinkList } from '../components/link-list.js';
import { createDropdown } from '../components/dropdown.js';
import { createModal } from '../components/modal.js';
import { createToast } from '../components/toast.js';
import { icon } from '../components/dom.js';
import { getLinksForProject } from '../services/link-service.js';
import { createExportService } from '../services/export-service.js';
import { downloadText } from '../utils/download.js';

function start() {
  const $ = (id) => document.getElementById(id);
  const state = { projects: [], links: [], activeProjectId: null, searchQuery: '' };
  let refreshVersion = 0;
  let pendingCapture = null;
  let takingPending = false;
  let pendingCheckRequested = false;
  const toast = createToast($('toast'));
  const dropdown = createDropdown($('dropdown'));
  const modal = createModal($('dialog'), () => {
    if (pendingCapture) queueMicrotask(() => createProjectDialog());
  });
  const exports = createExportService(readWorkspace, downloadText);
  const renderTabs = createProjectTabs($('project-tabs'), (id) => run(async () => {
    dropdown.close(false);
    await mutate(COMMANDS.SET_ACTIVE_PROJECT, { id });
  }));
  const renderLinks = createLinkList($('link-list'), {
    onOpen: (url) => run(() => openLink(url)),
    onMenu: showLinkMenu,
  });

  for (const node of document.querySelectorAll('[data-icon]')) node.append(icon(node.dataset.icon));

  function run(operation) {
    Promise.resolve().then(operation).catch((error) => {
      console.error('LinkYard:', error);
      toast(error.message || 'Something went wrong. Please try again.');
    });
  }

  function activeProject() {
    return state.projects.find((project) => project.id === state.activeProjectId);
  }

  function apply(workspace) {
    const activeId = workspace.settings.activeProjectId;
    if (activeId !== state.activeProjectId) {
      state.searchQuery = '';
      $('search').value = '';
      dropdown.close(false);
    }
    state.projects = workspace.projects;
    state.links = workspace.links;
    state.activeProjectId = activeId;
    $('loading').hidden = true;
    $('error-state').hidden = true;
    render();
  }

  async function refresh() {
    const version = ++refreshVersion;
    const workspace = await readWorkspace();
    if (version === refreshVersion) apply(workspace);
  }

  async function mutate(name, payload) {
    const result = await command(name, payload);
    // Read the latest committed snapshot: another window may have written while
    // the command's context-menu rebuild was finishing.
    await refresh();
    return result;
  }

  function render() {
    const project = activeProject();
    $('welcome').hidden = Boolean(project);
    $('project-panel').hidden = !project;
    renderTabs(state.projects, state.links, state.activeProjectId);
    if (!project) { renderLinks([]); return; }
    const total = state.links.filter((link) => link.projectId === project.id).length;
    const visible = getLinksForProject({ links: state.links }, project.id, state.searchQuery);
    $('project-panel').setAttribute('aria-labelledby', `project-tab-${project.id}`);
    $('project-name').textContent = project.name;
    $('project-name').title = project.name;
    $('link-count').textContent = total;
    $('link-count').setAttribute('aria-label', `${total} ${total === 1 ? 'link' : 'links'}`);
    $('list-summary').textContent = state.searchQuery ? `${visible.length} OF ${total} LINKS` : 'COLLECTED LINKS';
    $('empty-links').hidden = total !== 0 || Boolean(state.searchQuery);
    $('no-results').hidden = !state.searchQuery || visible.length !== 0;
    $('search-status').textContent = state.searchQuery ? `${visible.length} matching links` : '';
    renderLinks(visible);
  }

  function createProjectDialog() {
    if (modal.isOpen()) return;
    const capture = pendingCapture;
    pendingCapture = null;
    modal.open({
      title: 'New project',
      description: capture ? 'Create a project and collect the link you just selected.' : undefined,
      fields: [{ name: 'name', label: 'Name', placeholder: 'e.g. OpenAI Research', maxLength: MAX_PROJECT_NAME }],
      submitLabel: 'Create',
      async onSubmit({ name }) {
        const result = await mutate(COMMANDS.CREATE_PROJECT, { name, linkInput: capture?.input });
        toast(capture ? `Added to ${result.project.name}` : `Created ${result.project.name}`);
      },
    });
  }

  function renameProjectDialog(project) {
    modal.open({
      title: 'Rename project',
      fields: [{ name: 'name', label: 'Name', value: project.name, maxLength: MAX_PROJECT_NAME }],
      async onSubmit({ name }) {
        await mutate(COMMANDS.RENAME_PROJECT, { id: project.id, name });
        toast('Project renamed');
      },
    });
  }

  function deleteProjectDialog(project) {
    const count = state.links.filter((link) => link.projectId === project.id).length;
    modal.open({
      title: 'Delete project?',
      description: `“${project.name}” and its ${count} ${count === 1 ? 'link' : 'links'} will be permanently deleted.`,
      submitLabel: 'Delete project', danger: true,
      async onSubmit() {
        await mutate(COMMANDS.DELETE_PROJECT, { id: project.id });
        toast('Project deleted');
      },
    });
  }

  function addLinkDialog() {
    const project = activeProject();
    if (!project) return createProjectDialog();
    modal.open({
      title: 'Add link',
      fields: [{ name: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com/article' }],
      submitLabel: 'Add',
      async onSubmit({ url }) {
        const result = await mutate(COMMANDS.ADD_LINK, { projectId: project.id, input: { url } });
        toast(`${result.duplicate ? 'Already in' : 'Added to'} ${project.name}`);
      },
    });
  }

  function moveLinkDialog(link) {
    const targets = state.projects.filter((project) => project.id !== link.projectId);
    if (!targets.length) { toast('Create another project to move this link.'); return; }
    modal.open({
      title: 'Move link',
      description: link.title,
      fields: [{ name: 'target', label: 'Project', options: targets.map((project) => ({ value: project.id, label: project.name })) }],
      submitLabel: 'Move',
      async onSubmit({ target }, { setError }) {
        const result = await mutate(COMMANDS.MOVE_LINK, { id: link.id, targetProjectId: target });
        if (result.duplicate) {
          setError(`Already in ${result.project.name}. Choose another project.`);
          return false;
        }
        toast(`Moved to ${result.project.name}`);
      },
    });
  }

  function showLinkMenu(button, link) {
    dropdown.open(button, [
      { label: 'Open in new tab', onSelect: () => run(() => openLink(link.url)) },
      { label: 'Copy URL', onSelect: () => run(async () => { await navigator.clipboard.writeText(link.url); toast('Link copied'); }) },
      { label: 'Move to project…', disabled: state.projects.length < 2, onSelect: () => moveLinkDialog(link) },
      { separator: true },
      { label: 'Delete link', danger: true, onSelect: () => run(async () => {
        await mutate(COMMANDS.DELETE_LINK, { id: link.id });
        toast('Link deleted');
      }) },
    ]);
  }

  function exportAction(label, operation, all = false) {
    return { label, onSelect: () => run(async () => {
      await operation();
      toast(all ? 'Workspace exported' : 'Project exported');
    }) };
  }

  function showProjectMenu() {
    const project = activeProject();
    if (!project) return;
    dropdown.open($('project-menu'), [
      { label: 'Rename project…', onSelect: () => renameProjectDialog(project) },
      { separator: true }, { heading: 'Export project' },
      exportAction('Export as JSON', () => exports.exportProjectAsJson(project.id)),
      exportAction('Export as TXT', () => exports.exportProjectAsTxt(project.id)),
      { separator: true },
      { label: 'Delete project…', danger: true, onSelect: () => deleteProjectDialog(project) },
    ]);
  }

  function showWorkspaceMenu() {
    dropdown.open($('workspace-menu'), [
      { heading: 'Export all' },
      exportAction('Export all as JSON', () => exports.exportAllAsJson(), true),
      exportAction('Export all as TXT', () => exports.exportAllAsTxt(), true),
      { separator: true },
      { label: 'About LinkYard', onSelect: () => modal.open({
        title: 'About LinkYard',
        description: `Collect without breaking your browsing flow. LinkYard ${getVersion()} stores links in local Chrome storage. No account, tracking, analytics, external server or cloud sync. Exports are generated locally.`,
        submitLabel: 'Got it', onSubmit: () => {},
      }) },
    ]);
  }

  async function checkPendingCapture() {
    if (takingPending) { pendingCheckRequested = true; return; }
    takingPending = true;
    try {
      const { pending } = await command(COMMANDS.TAKE_PENDING_CAPTURE);
      if (pending) { pendingCapture = pending; createProjectDialog(); }
    } finally {
      takingPending = false;
      if (pendingCheckRequested) {
        pendingCheckRequested = false;
        run(checkPendingCapture);
      }
    }
  }

  async function initialize() {
    try {
      await refresh();
      await checkPendingCapture();
    } catch (error) {
      console.error('LinkYard:', error);
      $('loading').hidden = true;
      $('welcome').hidden = true;
      $('project-panel').hidden = true;
      $('error-state').hidden = false;
      $('startup-error').textContent = error.message || 'Reload the extension and try again.';
    }
  }

  $('new-project').addEventListener('click', createProjectDialog);
  $('create-first-project').addEventListener('click', createProjectDialog);
  $('add-link').addEventListener('click', addLinkDialog);
  $('add-first-link').addEventListener('click', addLinkDialog);
  $('workspace-menu').addEventListener('click', showWorkspaceMenu);
  $('project-menu').addEventListener('click', showProjectMenu);
  $('retry').addEventListener('click', () => run(initialize));
  $('search').addEventListener('input', (event) => { state.searchQuery = event.target.value; render(); });
  $('clear-search').addEventListener('click', () => {
    state.searchQuery = '';
    $('search').value = '';
    render();
    $('search').focus();
  });
  const unsubscribe = subscribe({
    onWorkspaceChange: () => run(refresh),
    onFeedback: toast,
    onPendingCapture: () => run(checkPendingCapture),
  });
  const clock = setInterval(render, 60_000);
  window.addEventListener('pagehide', () => { unsubscribe(); clearInterval(clock); }, { once: true });
  run(initialize);
}

start();
