# LinkYard

<img src="src/assets/icons/icon-128.png" alt="LinkYard logo" width="64" height="64">

LinkYard is a project-based link collector for your browser. Right-click, collect, keep moving.

Collect without breaking your browsing flow. Keep research in projects, browse alongside a compact Chrome side panel, and export your links whenever you need them.

## Features

- Project tabs with persistent selection and horizontal scrolling
- Chrome context menu: quick collection into the current project or any other project
- Create a project from the context menu and save the selected link in one step
- Side panel opened from the toolbar icon
- Local-first storage, without accounts or a backend
- Search titles, URLs, domains and source metadata within the active project
- Duplicate detection, including URL fragments and trailing slashes
- Open, copy, rename, move and delete links
- Create, rename and delete projects
- Project JSON and TXT exports
- oj-designsystem with a compact dark theme, local Comfortaa/JetBrains Mono fonts and Font Awesome icons
- Keyboard controls, accessible menus, native dialogs and tooltips
- Stacked notifications with dismiss buttons and timers that pause on hover/focus

## Install

Requires Chrome 116 or later. The design system and its assets are committed locally; no build step or dependency installation is needed to load the extension.

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this LinkYard project directory, containing `manifest.json`.
5. Pin LinkYard in Chrome's extensions menu and click its icon to open the side panel.

After changing extension files, click **Reload** on its card in `chrome://extensions`, then reopen the panel.

## Usage

Create a project → browse the web → right-click a link → add it to LinkYard.

### Collect links with a right-click

The quick context-menu entry shows `Add to "Your project"`. The **Add to LinkYard** submenu lets you pick another project; this does not switch your active project. **New Project…** opens the side panel, asks for a name and collects the selected link in that new project. Chrome may group multiple extension menu entries inside one LinkYard parent menu.

![Chrome's link context menu showing LinkYard's quick-add action and project selection](src/assets/screens/add_to.png)

### Manage links in the side panel

Switch projects with the tabs, which show each project's name and link count. Use **New project** next to the tabs to create a project. Under the tabs, **Add link** adds an HTTP/HTTPS URL manually and the project menu offers actions for the selected project. Search occupies its own full-width row below these actions. Project names are trimmed and limited to 100 characters. Click the header with the logo and **LinkYard** to open **About LinkYard**.

Links appear newest first. The link's menu offers **Open in new tab**, **Copy URL**, **Rename link…**, **Move to project…** and **Delete link**. Renaming a link changes its displayed name, which is also used in search and JSON exports. A URL already present in the destination project cannot be moved there. Deleting a project asks for confirmation and removes all its links.

The project menu also offers **Open all links**. It opens all links in that project in background tabs, newest first, with one second between openings. This includes links hidden by the current search. The action is disabled for empty projects and while a batch is opening.

Use arrow keys or Home/End to switch projects and navigate menus, Enter to activate or submit, and Escape to close dialogs or menus. Type a menu item's first letters to find it. Notifications can be dismissed, and their timers pause while hovered or focused. Collection feedback appears briefly on the toolbar badge and as a toast when the panel is open: `✓` means added, `=` means already collected, and `!` means an error.

<img src="src/assets/screens/in_browser.png" alt="LinkYard's Chrome side panel with project tabs, search and collected links" width="360">

## Export

Open the active project's `···` menu for:

- **Export as JSON**: a versioned document with the project and its links
- **Export as TXT**: a simple URL list, one link per line

Empty projects can also be exported; TXT files are empty when there are no links. TXT contains only URLs, without titles, headers, dates or other metadata. JSON uses `format: "linky-yard"`, `version: 1`, ISO timestamps and two-space indentation. Exports omit settings and internal UI state. Links sort by creation date descending, with deterministic ID tie-breakers.

Project filenames are normalized safely, e.g. `AI / EU: Research?` becomes `ai-eu-research-linkyard.json`. Files are UTF-8 and generated with local Blobs; temporary object URLs are released after the download starts. No download permission is required.

## Architecture

Manifest V3, vanilla JavaScript modules, HTML and CSS, with [oj-designsystem](https://github.com/oliverjessner/oj-designsystem) 0.1.0 for shared UI components. No frontend framework or bundler. Node.js is used only for tests, development checks and refreshing the vendored design system.

```text
manifest.json
src/
  assets/images/logo.png       Original supplied logo
  assets/icons/               Transparent 16/32/48/128 px icons
  background/                 Chrome events, capture and message routing
  storage/                    Local storage adapter and record validation
  services/                   Projects, links, write queue, context menus, exports
  utils/                      URL validation, normalization, dates, downloads
  sidepanel/                  HTML/CSS, UI state and Chrome API client
  components/                 Tabs, keyed link list, dialogs, menus and toasts
  vendor/oj-designsystem/      Pinned local CSS/ESM, fonts, icons and original licenses
tests/                        Node native tests and browser regression fixtures
scripts/                      Manifest/code checks and icon conversion
```

The background service worker is the only writer. It serializes read-modify-write operations so simultaneous captures and multiple panels do not overwrite each other. Related project, link and settings changes are saved together. The UI reads committed snapshots and subscribes to storage changes. Services are independent of Chrome APIs and return new data instead of mutating their inputs.

Context menus rebuild centrally after project creation, rename, deletion or selection. Identical menu configurations skip unnecessary work; rebuilds are serialized and clear old entries first. The worker registers event listeners synchronously so Chrome can wake it after suspension.

The export service exposes pure serializers and two project download operations. Chrome access, storage, business logic, UI and export are separate modules, leaving room for future integrations without implementing a backend or sync now.

### Design system

The side panel loads the unmodified public CSS and ESM distribution of oj-designsystem from `src/vendor/oj-designsystem/`. The application sets only `--oj-accent` for its green branding and uses oj tokens for layout and link-specific presentation. Buttons, fields, lists, badges, empty/loading/error states, tabs, menus, tooltips, native dialogs and notifications use the shared components. Project actions, storage and filtering remain in LinkYard.

Fonts and Font Awesome icons load from local WOFF2 assets. Original MIT/OFL/Font Awesome licenses and notices ship in the extension ZIP. `metadata.json` records the exact package version and SHA256 of every copied file; `npm run check` verifies the snapshot without requiring `node_modules`.

To refresh the snapshot after deliberately updating the exact dependency pin:

```sh
npm ci
npm run vendor:designsystem
npm run check
```

### Chrome APIs and permissions

Only `storage`, `contextMenus` and `sidePanel` permissions are requested.

- `chrome.storage.local` stores user data.
- `chrome.storage.session` temporarily holds a context-menu capture while the new-project dialog opens. It expires after five minutes and is not persisted across a browser restart.
- `chrome.contextMenus` provides link-only collection actions.
- `chrome.sidePanel` opens the global panel from the toolbar and from **New Project…**.
- `chrome.runtime` routes commands and feedback.
- `chrome.action` provides short badge feedback.
- `chrome.tabs.create` opens links and does not require the `tabs` permission ([Chrome API documentation](https://developer.chrome.com/docs/extensions/reference/api/tabs)).

No `tabs`, `downloads`, host permissions or content scripts. The extension does not read browser history or fetch target pages. The extension-page CSP restricts scripts to local files and blocks network connections.

### Storage

Keys are centralized in `src/constants.js`:

```js
{
  projects: [{ id, name, createdAt, updatedAt }],
  links: [{
    id, projectId, url, normalizedUrl, title,
    sourceUrl, sourceTitle, domain, createdAt,
    note: null, tags: []
  }],
  settings: { activeProjectId: null }
}
```

IDs use `crypto.randomUUID()`. Link counts are derived, never stored separately. The UI's search query stays in memory. Missing keys get defaults; damaged records are skipped with a console error; stale project selection falls back to the first surviving project. Normalized URLs are recomputed on read, and duplicates are checked per project.

## Development and verification

Use Node.js 22.12 or later:

```sh
npm test
npm run check
```

For browser regression checks, install the development dependencies and Chromium once:

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

The browser suite loads the real side-panel modules with a Chrome API fixture, uses the extension's CSP, and exercises keyboard navigation, project/link actions, validation, notifications, responsive layouts and local fonts/icons. It complements checking the extension inside Chrome.

Native `node:test` suites cover URL handling, project validation and deletion, duplicate detection, moves, search, damaged storage, concurrent writes, restart persistence, context-menu rebuilding, project exports and packaged design-system assets. The check command validates Manifest V3, necessary permissions, icon dimensions, local assets, CSS font/icon references, design-system integrity, module imports, CSP-compatible HTML and JavaScript syntax.

The original logo is kept intact in `src/assets/images/logo.png`. Committed PNGs are used for the toolbar, extension manager, context menu, side panel and page icon. To regenerate them on macOS, with Swift installed:

```sh
swift scripts/generate-icons.swift
```

This deterministic conversion removes transparent outer padding, preserves the logo's proportions, centers it on square transparent canvases and generates each required size. It is a development utility, not a build step.

For a manual Chrome check: create a project, collect a link with the context menu, collect it again, switch/rename/delete projects, open and move links, search, download both project export formats, open About from the header, use Enter/Escape in dialogs, and restart Chrome to verify stored projects and selection. Resize the panel and create many tabs to verify horizontal scrolling.

## Publish to the Chrome Web Store

The Node.js release script uses [Chrome Web Store API v2](https://developer.chrome.com/docs/webstore/using-api). Requires Node.js 22.12+ and the `zip` and `unzip` commands on PATH (included on macOS; install them through your system package manager elsewhere).

### Create the release ZIP

```sh
npm run pack:chrome
# Equivalent: npm run publish:chrome -- --dry-run
```

This runs the manifest/code checks and all native tests, then creates `dist/linkyard-<version>.zip`. The ZIP contains `manifest.json` at the root, runtime JavaScript/HTML/CSS, the extension icons and local oj-designsystem fonts/icons/licenses. Screenshots, the original logo, tests, documentation, development scripts, hidden files and credentials are excluded. Each run creates a fresh archive so deleted files cannot remain in an older ZIP. This mode is fully local and needs no credentials.

### One-time setup

1. For the first release, upload the generated ZIP with **Add new item** in the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole), then complete the Store Listing, Privacy and Distribution sections. Google requires a registered developer account with 2-step verification. See the [first publication guide](https://developer.chrome.com/docs/webstore/publish).
2. Enable the Chrome Web Store API in a Google Cloud project, configure an OAuth client and obtain a refresh token with the `https://www.googleapis.com/auth/chromewebstore` scope. Authorize with the Google account that owns the Web Store item. Follow [Google's API setup guide](https://developer.chrome.com/docs/webstore/using-api).
3. Copy the configuration template:

   ```sh
   cp .env.example .env
   ```

4. Fill in `CWS_PUBLISHER_ID`, `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET` and `CWS_REFRESH_TOKEN`. The publisher ID and extension ID come from the Developer Dashboard. `.env` is ignored by Git; CI can supply the same values as environment variables, which take precedence over the file.

### Upload and submit

Keep the versions in `manifest.json` and `package.json` identical, and increase both before uploading a new version. Then run:

```sh
npm run publish:chrome
```

The script validates the release, creates the ZIP, refreshes the OAuth access token, uploads the package, waits for upload processing and submits it for publication. [Google reviews the submission and publishes it after approval](https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/publish), using the item's existing visibility settings. The terminal shows the returned submission state; `PENDING_REVIEW` means submitted, not already live.

To upload a draft and handle submission in the Developer Dashboard:

```sh
npm run publish:chrome -- --upload-only
```

Use `npm run publish:chrome -- --help` for the available options. Failed checks, authentication, uploads or status polling stop the script with a nonzero exit code. Requests have timeouts, and upload/publish POST requests are not automatically retried. OAuth tokens and client secrets are not printed.

## Privacy

LinkYard stores all data locally in Chrome. No account, tracking, analytics, external server or cloud sync is used. Links stay in local Chrome storage; exports are generated locally. There are no telemetry calls or third-party UI/font/favicon requests.

Opening a saved link navigates Chrome to the chosen website. Export files are saved to your normal download destination. Uninstalling the extension removes its Chrome storage, so export your collections first if you want to keep a copy.

Read the [Privacy Policy](PRIVACY.md) for details about the data processed, permissions, storage, exports and deletion, and how to contact the developer.

For the Chrome Web Store, publish `PRIVACY.md` at a publicly accessible URL and enter that URL in the Privacy policy field of the Developer Dashboard. See [Google's privacy policy requirements](https://developer.chrome.com/docs/webstore/program-policies/privacy).

## MVP limitations

- Chrome only; no Firefox, Safari or mobile support.
- Chrome's context-menu API does not provide reliable link text. Captured titles fall back to the target domain. Source titles are kept only when Chrome provides them; no broad tab-reading permission is requested.
- No imports, sync, accounts, sharing, scraping, AI, notes UI or tags UI.
- Data is local to this Chrome profile. Normal Chrome local-storage quotas apply.
- URL normalization preserves query parameters, including tracking parameters; it only removes fragments, normalizes the hostname/default ports, and treats trailing path slashes as equivalent.

Changes are listed in [the changelog](docs/changelog.md).
