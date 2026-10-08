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
  await page.getByRole('button', { name: 'Project menu', exact: true }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

test('projects and links persist through create, deduplication, search, rename and deletion', async ({ page, app }) => {
  await app.load();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.locator('#new-project').click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Research');
  await submitDialog(page, 'Create');
  await expect(page.locator('#project-name')).toHaveText('Research');
  await expect(page.locator('#new-project')).toBeFocused();

  for (const url of ['https://example.com/article#reading', 'https://example.com/article/', 'https://other.test/notes']) {
    await page.locator('#add-link').click();
    await expect(page.getByRole('textbox', { name: 'URL', exact: true })).toBeFocused();
    await page.getByRole('textbox', { name: 'URL', exact: true }).fill(url);
    await submitDialog(page, 'Add');
  }
  await expect(page.locator('#link-list > li')).toHaveCount(2);
  await expect(page.locator('#link-count')).toHaveText('2');
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
  await expect(page.locator('#project-name')).toHaveText('Renamed research');
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

test('project tabs activate with click, arrows and Home/End while retaining real panel content', async ({ page, app }) => {
  await app.load({ projects: ['Research', 'Archive', 'Reading'].map((name) => ({
    name, links: [{ url: `https://${name.toLowerCase()}.test/article`, title: `${name} article` }],
  })) });

  async function selected(name, focused = true) {
    const tab = page.getByRole('tab', { name: `${name} 1`, exact: true });
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    if (focused) await expect(tab).toBeFocused();
    await expect(page.locator('#project-name')).toHaveText(name);
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
  await expect(page.locator('#project-name')).toHaveText('Archive');
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
  await expect(page.locator('#project-name')).toHaveText('Archive');
  await expect(page.getByRole('link', { name: 'Archive article', exact: true })).toBeVisible();
  await expect(page.locator('.oj-toast-danger')).toContainText('Selection rejected in browser regression.');
});

test('OJ menus support keyboard dismissal and duplicate moves keep the dialog actionable', async ({ page, app }) => {
  await app.load({ projects: [
    { name: 'Source', links: [{ url: 'https://example.test/shared', title: 'Shared article' }] },
    { name: 'Target', links: [{ url: 'https://example.test/shared/', title: 'Existing article' }] },
    { name: 'Empty' },
  ] });
  const workspaceMenu = page.locator('#workspace-menu');
  await workspaceMenu.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'About LinkYard', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(workspaceMenu).toBeFocused();
  await expect(page.getByRole('menu')).toBeHidden();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Export all as JSON', exact: true })).toBeFocused();
  await page.keyboard.press('a');
  await expect(page.getByRole('menuitem', { name: 'About LinkYard', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(workspaceMenu).not.toBeFocused();
  await workspaceMenu.click();
  await page.locator('#search').click();
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(page.locator('#search')).toBeFocused();

  const projectMenu = page.locator('#project-menu');
  await projectMenu.focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Delete project…', exact: true })).toBeFocused();
  await page.keyboard.press('r');
  await expect(page.getByRole('menuitem', { name: 'Rename project…', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(projectMenu).toBeFocused();

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
  for (const width of [280, 360, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(page.locator('#project-panel')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    for (const selector of ['#new-project', '#workspace-menu', '#project-menu', '#add-link', '.link-menu-button']) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds.x, `${selector} stays within a ${width}px panel`).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    }
    await page.locator('#project-menu').click();
    const menu = await page.getByRole('menu').boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width + 1);
    await page.keyboard.press('Escape');
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
