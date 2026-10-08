import { mkdir } from 'node:fs/promises';
import { test as base, expect } from '@playwright/test';

const test = base.extend({
  app: async ({ page }, use) => {
    const errors = [];
    const remoteRequests = [];
    const expectedErrors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !expectedErrors.some((text) => message.text().includes(text))) errors.push(message.text());
    });
    page.on('requestfailed', (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.url()}: HTTP ${response.status()}`);
    });
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== 'http://127.0.0.1:4177') remoteRequests.push(request.url());
    });

    async function load(seed = {}) {
      await page.addInitScript(async ({ projects = [], active = 0 }) => {
        const data = {};
        const storageListeners = new Set();
        const messageListeners = new Set();
        const event = (listeners) => ({
          addListener: (listener) => listeners.add(listener),
          removeListener: (listener) => listeners.delete(listener),
        });
        const area = {
          async get(keys) {
            return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, structuredClone(data[key])]));
          },
          async set(values) {
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
              changes[key] = { oldValue: structuredClone(data[key]), newValue: structuredClone(value) };
              data[key] = structuredClone(value);
            }
            queueMicrotask(() => storageListeners.forEach((listener) => listener(changes, 'local')));
          },
        };
        const openedUrls = [];
        let delayedSelection = null;
        let releaseSelection = null;
        let rejectSelection = false;
        const ready = Promise.all([
          import('/src/services/workspace-service.js'),
          import('/src/storage/storage.js'),
        ]).then(async ([{ createWorkspaceService }, { createStorage }]) => {
          const service = createWorkspaceService(createStorage(area));
          const created = [];
          for (const project of projects) {
            const result = await service.execute('createProject', { name: project.name });
            created.push(result.project);
            for (const input of project.links || []) {
              await service.execute('addLink', { projectId: result.project.id, input });
            }
          }
          if (created.length) await service.execute('setActiveProject', { id: created[active].id });
          return service;
        });
        window.chrome = {
          storage: { local: area, onChanged: event(storageListeners) },
          runtime: {
            getManifest: () => ({ version: '0.2.1' }),
            onMessage: event(messageListeners),
            async sendMessage(message) {
              try {
                const service = await ready;
                if (message.command === 'setActiveProject') {
                  const delay = delayedSelection;
                  delayedSelection = null;
                  if (delay) await delay;
                  if (rejectSelection) {
                    rejectSelection = false;
                    throw new Error('Selection rejected in browser regression.');
                  }
                }
                const result = message.command === 'takePendingCapture'
                  ? { pending: null } : await service.execute(message.command, message.payload);
                return { ok: true, result };
              } catch (error) {
                return { ok: false, error: error.message };
              }
            },
          },
          tabs: { create: async ({ url }) => openedUrls.push(url) },
        };
        window.__linkyardTest = {
          read: async () => (await ready).read(),
          openedUrls,
          feedback: (message) => messageListeners.forEach((listener) => listener({ type: 'linkyard/feedback', message })),
          delayNextSelection: () => {
            delayedSelection = new Promise((resolve) => { releaseSelection = resolve; });
          },
          releaseSelection: () => releaseSelection?.(),
          failNextSelection: () => { rejectSelection = true; },
        };
      }, seed);
      const response = await page.goto('/src/sidepanel/index.html');
      expect(response.headers()['content-security-policy']).toBe("script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'");
      await expect(page.locator('#loading')).toBeHidden();
      await expect(page.locator('#error-state')).toBeHidden();
      await page.evaluate(() => document.fonts.ready);
    }

    await use({
      load,
      read: () => page.evaluate(() => window.__linkyardTest.read()),
      expectError: (text) => expectedErrors.push(text),
    });
    expect(remoteRequests, 'Every script, font and image must remain local').toEqual([]);
    expect(errors, 'The real side panel should have no browser, CSP or application errors').toEqual([]);
  },
});

async function submitDialog(page, name) {
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}

async function openProjectAction(page, label) {
  await page.getByRole('button', { name: /^Actions for project / }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

test('projects and links persist through create, deduplication, search, rename and deletion', async ({ page, app }) => {
  await app.load();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.locator('#new-project').click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Research');
  await submitDialog(page, 'Create');
  await expect(page.getByRole('tab', { name: 'Research 0', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#new-project')).toBeFocused();

  for (const url of ['https://example.com/article#reading', 'https://example.com/article/', 'https://other.test/notes']) {
    await page.locator('#add-link').click();
    await expect(page.getByRole('textbox', { name: 'URL', exact: true })).toBeFocused();
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill(url);
    await submitDialog(page, 'Add');
  }
  await expect(page.locator('#link-list > li')).toHaveCount(2);
  await expect(page.getByRole('tab', { name: 'Research 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await app.read()).links).toHaveLength(2);

  await page.getByRole('searchbox', { name: 'Search links' }).fill('example.com');
  await expect(page.locator('#link-list > li')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Search links' }).fill('not-in-this-project');
  await expect(page.locator('#no-results')).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('#search')).toBeFocused();
  await expect(page.locator('#link-list > li')).toHaveCount(2);
  await page.getByRole('link', { name: 'example.com', exact: true }).click();
  expect(await page.evaluate(() => window.__linkyardTest.openedUrls)).toEqual(['https://example.com/article#reading']);

  await openProjectAction(page, 'Rename project…');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Renamed research');
  await submitDialog(page, 'Save');
  await expect(page.getByRole('tab', { name: 'Renamed research 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-menu')).toHaveAccessibleName('Actions for project Renamed research');
  await expect(page.locator('#project-menu')).toBeFocused();
  expect((await app.read()).projects[0].name).toBe('Renamed research');

  await openProjectAction(page, 'Delete project…');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#project-menu')).toBeFocused();
  await openProjectAction(page, 'Delete project…');
  await submitDialog(page, 'Delete project');
  await expect(page.locator('#welcome')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  const workspace = await app.read();
  expect(workspace.projects).toEqual([]);
  expect(workspace.links).toEqual([]);
});

test('navigation keeps creation actions beside their context and search independent after project changes', async ({ page, app }) => {
  await app.load({ projects: [{
    name: 'Research', links: [{ url: 'https://research.test/article', title: 'Research article' }],
  }] });
  const newProject = page.getByRole('button', { name: 'New project', exact: true });
  const addLink = page.getByRole('button', { name: 'Add link', exact: true });
  const search = page.getByRole('searchbox', { name: 'Search links', exact: true });
  const panel = page.locator('#project-panel');
  await expect(newProject).toHaveText('New project');
  await expect(newProject).toHaveClass(/oj-button-ghost/);
  await expect(newProject).toHaveClass(/oj-button-compact/);
  await expect(addLink).toHaveText('Add link');
  await expect(addLink).toHaveClass(/oj-button-primary/);
  expect(await newProject.evaluate((button) => ({
    inTabList: Boolean(button.closest('[role="tablist"]')),
    isTab: button.getAttribute('role') === 'tab',
    selected: button.getAttribute('aria-selected'),
  }))).toEqual({ inTabList: false, isTab: false, selected: null });
  await expect(page.getByRole('navigation', { name: 'Projects' }).getByRole('button', { name: 'New project', exact: true })).toBeVisible();
  await expect(page.locator('#project-name, #link-count')).toHaveCount(0);
  await expect(panel.getByText('Research', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Research 1', exact: true }).locator('.tab-count')).toHaveText('1');
  await expect(page.locator('.search-field #add-link')).toHaveCount(0);
  await expect(page.getByText('Search links', { exact: true })).toBeVisible();
  await expect(search).toHaveAttribute('placeholder', 'Title, domain or URL…');
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/linkyard-oj-single-project-360.png', fullPage: true });

  // A short tab group must not stretch away from its creation action.
  await page.setViewportSize({ width: 1024, height: 800 });
  const tabsBounds = await page.getByRole('tab', { name: 'Research 1', exact: true }).boundingBox();
  const newBounds = await newProject.boundingBox();
  expect(newBounds.x - (tabsBounds.x + tabsBounds.width)).toBeGreaterThanOrEqual(0);
  expect(newBounds.x - (tabsBounds.x + tabsBounds.width)).toBeLessThanOrEqual(12);
  await newProject.click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Archive');
  await submitDialog(page, 'Create');
  await expect(page.getByRole('tab', { name: 'Archive 0', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Research 1', exact: true }).click();
  await search.fill('Research');
  await page.getByRole('tab', { name: 'Archive 0', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('#project-menu')).toHaveAccessibleName('Actions for project Archive');
  await search.fill('archive.test');
  await addLink.click();
  const url = page.getByRole('textbox', { name: 'URL', exact: true });
  await expect(url).toHaveValue('');
  await url.fill('https://archive.test/collected');
  await submitDialog(page, 'Add');
  await expect(addLink).toBeFocused();
  await expect(search).toHaveValue('archive.test');
  await expect(page.getByRole('link', { name: 'archive.test', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Archive 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Research 1', exact: true })).toBeVisible();
  const workspace = await app.read();
  expect(workspace.links.find((link) => link.url === 'https://archive.test/collected').projectId).toBe(workspace.projects[1].id);

  const about = page.getByRole('button', { name: 'About LinkYard', exact: true });
  await expect(page.locator('header').getByRole('button')).toHaveCount(1);
  await expect(page.locator('header').getByRole('button')).toHaveAccessibleName('About LinkYard');
  await expect(page.locator('#workspace-menu')).toHaveCount(0);
  await expect(page.getByText(/Export all/)).toHaveCount(0);
  await about.click();
  await expect(page.getByRole('dialog', { name: 'About LinkYard', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('stores links in local Chrome storage');
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Oliver Jessner', exact: true })).toHaveAttribute('href', 'https://oliverjessner.at');
  await submitDialog(page, 'Got it');
  await expect(about).toBeFocused();
  await page.locator('#project-menu').click();
  await expect(page.getByRole('menuitem', { name: 'Export as TXT', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Export all as TXT', exact: true })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Rename project…', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Archive');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Renamed archive');
  await submitDialog(page, 'Save');
  await expect(page.locator('#project-menu')).toHaveAccessibleName('Actions for project Renamed archive');
  await expect(page.getByRole('tab', { name: 'Renamed archive 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await app.read()).projects.map((project) => project.name)).toEqual(['Research', 'Renamed archive']);
  await page.getByRole('button', { name: 'Actions for archive.test', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Rename link…', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Rename project…', exact: true })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Export all as TXT', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 360, height: 800 });
  const addBounds = await addLink.boundingBox();
  const projectMenuBounds = await page.locator('#project-menu').boundingBox();
  const searchBounds = await search.boundingBox();
  const panelBounds = await panel.boundingBox();
  expect(addBounds.x + addBounds.width).toBeLessThanOrEqual(projectMenuBounds.x);
  expect(searchBounds.y).toBeGreaterThan(addBounds.y + addBounds.height);
  expect(searchBounds.x).toBeCloseTo(panelBounds.x, 0);
  expect(searchBounds.width).toBeCloseTo(panelBounds.width, 0);
});

test('a single long project keeps New project directly after its visible tab', async ({ page, app }) => {
  const name = 'A research project with a deliberately long name '.repeat(2).slice(0, 100);
  await app.load({ projects: [{ name }] });
  await page.setViewportSize({ width: 1024, height: 800 });
  const tab = page.getByRole('tab', { name: `${name} 0`, exact: true });
  const newProject = page.getByRole('button', { name: 'New project', exact: true });
  const tabBounds = await tab.boundingBox();
  const newBounds = await newProject.boundingBox();
  const gap = newBounds.x - (tabBounds.x + tabBounds.width);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(12);
  expect(newBounds.y).toBeLessThan(tabBounds.y + tabBounds.height);
  expect(newBounds.y + newBounds.height).toBeGreaterThan(tabBounds.y);
  await expect(tab.locator('.tab-count')).toBeVisible();
  await mkdir('screenshots', { recursive: true });
  await page.screenshot({ path: 'screenshots/linkyard-oj-single-long-project-1024.png', fullPage: true });
});

test('link dropdown renames the selected link, validates names and updates search', async ({ page, app }) => {
  await app.load({ projects: [
    { name: 'Research', links: [
      { url: 'https://example.test/article#reading', title: 'Original article', sourceUrl: 'https://source.test/discussion' },
      { url: 'https://other.test/notes', title: 'Other notes' },
    ] },
    { name: 'Archive', links: [{ url: 'https://example.test/article#reading', title: 'Original article' }] },
  ] });
  const before = await app.read();
  const linkMenu = page.getByRole('button', { name: 'Actions for Original article', exact: true });
  await linkMenu.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('r');
  await expect(page.getByRole('menuitem', { name: 'Rename link…', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Name', exact: true });
  await expect(page.getByRole('dialog', { name: 'Rename link', exact: true })).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('Original article');
  await name.fill('Cancelled name');
  await submitDialog(page, 'Cancel');
  await expect(linkMenu).toBeFocused();
  expect(await app.read()).toEqual(before);

  await linkMenu.click();
  await page.getByRole('menuitem', { name: 'Rename link…', exact: true }).click();
  await name.fill('   ');
  app.expectError('Give your link a name.');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Give your link a name.');
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(name).toBeFocused();
  expect(await app.read()).toEqual(before);
  await name.fill('  Renamed research  ');
  await name.press('Enter');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Actions for Renamed research', exact: true })).toBeFocused();
  const renamed = page.getByRole('link', { name: 'Renamed research', exact: true });
  await expect(renamed).toHaveAttribute('href', 'https://example.test/article#reading');
  await expect(page.getByRole('tab', { name: 'Research 2', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.oj-toast-message')).toHaveText('Link renamed');
  const after = await app.read();
  expect(after.links[0]).toEqual({ ...before.links[0], title: 'Renamed research' });
  expect(after.links.slice(1)).toEqual(before.links.slice(1));

  await page.getByRole('searchbox', { name: 'Search links' }).fill('Renamed research');
  await expect(page.locator('#link-list > li')).toHaveCount(1);
  await renamed.click();
  expect(await page.evaluate(() => window.__linkyardTest.openedUrls)).toEqual(['https://example.test/article#reading']);
  await page.getByRole('searchbox', { name: 'Search links' }).fill('Original article');
  await expect(page.locator('#no-results')).toBeVisible();

  await page.getByRole('searchbox', { name: 'Search links' }).fill('Renamed research');
  await page.getByRole('button', { name: 'Actions for Renamed research', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename link…', exact: true }).click();
  await name.fill('Final article');
  await submitDialog(page, 'Save');
  await expect(page.locator('#no-results')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search links' })).toBeFocused();
  expect((await app.read()).links[0].title).toBe('Final article');
});

test('project tabs activate with click, arrows and Home/End while retaining real panel content', async ({ page, app }) => {
  await app.load({ projects: ['Research', 'Archive', 'Reading'].map((name) => ({
    name, links: [{ url: `https://${name.toLowerCase()}.test/article`, title: `${name} article` }],
  })) });

  async function selected(name, focused = true) {
    const tab = page.getByRole('tab', { name: `${name} 1`, exact: true });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    if (focused) await expect(tab).toBeFocused();
    await expect(page.locator('#project-menu')).toHaveAccessibleName(`Actions for project ${name}`);
    await expect(page.getByRole('tabpanel')).toHaveCount(1);
    await expect(page.getByRole('tabpanel').locator('#project-panel')).toBeVisible();
    await expect(page.getByRole('link', { name: `${name} article`, exact: true })).toBeVisible();
    await expect.poll(async () => {
      const workspace = await app.read();
      return workspace.projects.find((project) => project.id === workspace.settings.activeProjectId).name;
    }).toBe(name);
  }

  await page.getByRole('tab', { name: 'Archive 1', exact: true }).click();
  await selected('Archive');
  for (const [key, name] of [
    ['ArrowRight', 'Reading'], ['Home', 'Research'], ['End', 'Reading'],
    ['ArrowRight', 'Research'], ['ArrowLeft', 'Reading'],
  ]) {
    await page.keyboard.press(key);
    await selected(name);
  }
  await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
  const relationships = await page.locator('[role="tab"]').evaluateAll((tabs) => tabs.map((tab) => {
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    return { id: panel?.id, labelledBy: panel?.getAttribute('aria-labelledby') === tab.id };
  }));
  expect(new Set(relationships.map((panel) => panel.id)).size).toBe(3);
  expect(relationships.every((panel) => panel.id && panel.labelledBy)).toBe(true);

  // A slow background write must not expose another project's links/actions.
  await page.evaluate(() => window.__linkyardTest.delayNextSelection());
  await page.getByRole('tab', { name: 'Archive 1', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Archive 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-menu')).toHaveAccessibleName('Actions for project Archive');
  await expect(page.getByRole('link', { name: 'Archive article', exact: true })).toBeVisible();
  const beforeSelection = await app.read();
  expect(beforeSelection.projects.find((project) => project.id === beforeSelection.settings.activeProjectId).name).toBe('Reading');
  await openProjectAction(page, 'Rename project…');
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Archive');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__linkyardTest.releaseSelection());
  await selected('Archive', false);

  app.expectError('Selection rejected in browser regression.');
  await page.evaluate(() => window.__linkyardTest.failNextSelection());
  await page.getByRole('tab', { name: 'Research 1', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Archive 1', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#project-menu')).toHaveAccessibleName('Actions for project Archive');
  await expect(page.getByRole('link', { name: 'Archive article', exact: true })).toBeVisible();
  await expect(page.locator('.oj-toast-danger')).toContainText('Selection rejected in browser regression.');
});

test('the header opens About, OJ menus support keyboard dismissal and duplicate moves keep the dialog actionable', async ({ page, app }) => {
  await app.load({ projects: [
    { name: 'Source', links: [{ url: 'https://example.test/shared', title: 'Shared article' }] },
    { name: 'Target', links: [{ url: 'https://example.test/shared/', title: 'Existing article' }] },
    { name: 'Empty' },
  ] });
  const about = page.getByRole('button', { name: 'About LinkYard', exact: true });
  await about.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'About LinkYard', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(about).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('dialog', { name: 'About LinkYard', exact: true })).toBeVisible();
  await submitDialog(page, 'Got it');
  await expect(about).toBeFocused();
  await expect(page.getByRole('menu')).toBeHidden();

  const projectMenu = page.locator('#project-menu');
  await projectMenu.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Delete project…', exact: true })).toBeFocused();
  await page.keyboard.press('r');
  await expect(page.getByRole('menuitem', { name: 'Rename project…', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(projectMenu).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Rename project…', exact: true })).toBeFocused();
  await page.keyboard.press('e');
  await expect(page.getByRole('menuitem', { name: 'Export as JSON', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(projectMenu).not.toBeFocused();
  await projectMenu.click();
  await page.locator('#search').click();
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page.locator('#search')).toBeFocused();

  const linkMenu = page.getByRole('button', { name: 'Actions for Shared article', exact: true });
  await linkMenu.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Open in new tab', exact: true })).toBeFocused();
  await page.keyboard.press('m');
  await expect(page.getByRole('menuitem', { name: 'Move to project…', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const target = page.getByRole('combobox', { name: 'Project', exact: true });
  await expect(target).toBeFocused();
  await target.selectOption({ label: 'Target' });
  await page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Already in Target. Choose another project.');
  await expect(target).toHaveAttribute('aria-invalid', 'true');
  await expect(target).toBeFocused();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Move', exact: true })).toBeEnabled();
  const beforeMove = await app.read();
  expect(beforeMove.links.filter((link) => link.projectId === beforeMove.projects[0].id)).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(linkMenu).toBeFocused();

  await linkMenu.click();
  await page.getByRole('menuitem', { name: 'Move to project…', exact: true }).click();
  await target.selectOption({ label: 'Empty' });
  await submitDialog(page, 'Move');
  await expect(page.locator('#empty-links')).toBeVisible();
  await page.getByRole('tab', { name: 'Empty 1', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Shared article', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Shared article', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete link', exact: true }).click();
  await expect(page.locator('#empty-links')).toBeVisible();
  expect((await app.read()).links).toHaveLength(1);
});

test('narrow and wide panels handle long content, local assets and stacked notifications', async ({ page, app }) => {
  const longName = 'A research project with a deliberately long name '.repeat(2).slice(0, 100);
  await app.load({ projects: [
    { name: longName, links: [{
      url: `https://${'long-domain-'.repeat(10)}example.test/article`,
      title: `A long article title ${'continuous-text'.repeat(18)}`,
      sourceUrl: `https://${'long-source-'.repeat(10)}example.test/reference`,
      sourceTitle: 'A long source title',
    }] },
    ...Array.from({ length: 6 }, (_, index) => ({ name: `Another project ${index + 1}` })),
  ] });
  await mkdir('screenshots', { recursive: true });
  for (const width of [260, 280, 360, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator('#project-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New project', exact: true })).toHaveText('New project');
    await expect(page.getByRole('button', { name: 'Add link', exact: true })).toHaveText('Add link');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    for (const selector of ['#about-linkyard', '#new-project', '#project-menu', '#add-link', '.link-menu-button']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds.x, `${selector} stays within a ${width}px panel`).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
    const tabs = page.getByRole('tablist', { name: 'Projects' });
    const tabsBounds = await tabs.boundingBox();
    const newBounds = await page.locator('#new-project').boundingBox();
    expect(
      newBounds.x >= tabsBounds.x + tabsBounds.width || newBounds.y >= tabsBounds.y + tabsBounds.height,
      `Project tabs and New project do not overlap at ${width}px`,
    ).toBe(true);
    expect(await tabs.evaluate((element) => element.contains(document.getElementById('new-project')))).toBe(false);
    if (width <= 360) {
      expect(await tabs.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
      const newPosition = await page.locator('#new-project').boundingBox();
      await tabs.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      expect(await page.locator('#new-project').boundingBox()).toEqual(newPosition);
      await page.locator('#new-project').click();
      await expect(page.getByRole('dialog', { name: 'New project', exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#new-project')).toBeFocused();
      await tabs.evaluate((element) => { element.scrollLeft = 0; });
    }
    for (const selector of ['#project-menu', '.link-menu-button']) {
      await page.locator(selector).focus();
      await page.keyboard.press('ArrowDown');
      const menu = await page.getByRole('menu').boundingBox();
      expect(menu.x, `${selector} menu fits at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(menu.x + menu.width).toBeLessThanOrEqual(width + 1);
      expect(menu.y).toBeGreaterThanOrEqual(0);
      expect(menu.y + menu.height).toBeLessThanOrEqual(800);
      await expect(page.getByRole('menuitem').first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(page.locator(selector)).toBeFocused();
    }
    const addBounds = await page.locator('#add-link').boundingBox();
    const searchBounds = await page.locator('#search').boundingBox();
    expect(searchBounds.y).toBeGreaterThan(addBounds.y + addBounds.height);
    await page.locator('#add-link').click();
    const dialog = await page.getByRole('dialog').boundingBox();
    expect(dialog.x).toBeGreaterThanOrEqual(0);
    expect(dialog.x + dialog.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press('Escape');
    await page.locator('#search').focus();
    if (width !== 280) await page.screenshot({ path: `screenshots/linkyard-oj-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => {
    window.__linkyardTest.feedback('First capture complete');
    window.__linkyardTest.feedback('Second capture complete');
  });
  await expect(page.locator('.oj-toast')).toHaveCount(2);
  await expect(page.locator('.oj-toast').first()).toHaveAttribute('role', 'status');
  await expect(page.locator('.oj-toast').last()).toContainText('Second capture complete');
  await page.evaluate(() => document.fonts.ready);
  const assets = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
  expect(assets.some((url) => url.endsWith('/comfortaa-latin-wght-normal.woff2'))).toBe(true);
  expect(assets.some((url) => url.endsWith('/jetbrains-mono-latin-wght-normal.woff2'))).toBe(true);
  expect(assets.some((url) => url.endsWith('/fontawesome/fa-solid-900.woff2'))).toBe(true);
  expect(assets.some((url) => url.endsWith('/icon-48.png'))).toBe(true);
  await page.locator('.oj-toast').first().getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.locator('.oj-toast')).toHaveCount(1);
  await page.locator('.oj-toast').getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.locator('.oj-toast-region')).toHaveCount(0);
});
