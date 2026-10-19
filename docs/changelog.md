# Changelog

## Unreleased

- Added **Import TXT…** to each project's menu for local UTF-8 files with one HTTP/HTTPS URL per line.
- Imports append links in file order, ignore blank lines, skip duplicate/invalid URLs with result counts, and save each batch together without changing other projects.
- Added import validation, persistence/concurrency and browser checks, including file errors, retry after storage failure and narrow-panel dialogs.

## 0.2.3

- Adopted oj-designsystem 0.1.0 with its dark theme, Comfortaa/JetBrains Mono fonts, local Font Awesome icons and shared control, list, badge and empty-state styles.
- Replaced custom tab/menu/dialog/toast behavior with OJ helpers, including automatic keyboard tab activation, menu typeahead, tooltips, focus restoration and stacked dismissible notifications.
- Added a visible search label, accessible validation states and local-storage status.
- Committed reproducible design-system assets and licenses, validated their hashes/local URLs, and included them in Chrome release archives.
- Added browser regression checks for side-panel interactions and responsive layouts.

## 0.1.0

- Added the local-first Manifest V3 LinkYard extension with project tabs, side panel and link-only context menus.
- Added search, duplicate detection, link moves and local JSON/TXT exports for projects and the full workspace.
- Integrated the supplied logo as transparent toolbar/extension icons at 16, 32, 48 and 128 pixels and in the panel header.
- Added native Node tests and manifest, asset and syntax checks.
