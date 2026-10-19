# LinkYard Privacy Policy

Last updated: October 19, 2026

LinkYard is a Chrome extension for collecting and organizing web links into projects. It processes your collections locally in your Chrome profile. No account is required, and LinkYard does not upload your collections to the developer or an external server.

## Developer and contact

LinkYard is developed by Oliver Jessner.

- Website: [oliverjessner.at](https://oliverjessner.at)
- Privacy questions: [team@oliverjessner.at](mailto:team@oliverjessner.at), as listed on the developer's [contact page](https://oliverjessner.at/kontakt/)

## Data processed by the extension

When you use LinkYard, it processes:

- **Projects:** names you enter, locally generated identifiers, and creation and modification dates.
- **Saved links:** URLs, a normalized version of each URL for duplicate detection, domains, titles you enter or a domain-based fallback, project assignments, locally generated identifiers, and dates added.
- **Source information:** when you save a link through the context menu or collect external links from a page, that page's URL and title when available.
- **Preferences:** the identifier of your active project.
- **Temporary input:** a selected link and its source information while the new-project dialog opens, and text you enter into forms or search.
- **TXT imports:** the contents of a TXT file you explicitly select to import links into a project. The file is read locally; accepted URLs become saved links. The original file and its name are not stored in your collection.
- **Page link collection:** when you click **Collect external links**, the current page's anchor URLs and link text are read locally. Accepted external links, their titles and the source page's URL/title become part of the selected project. Full page HTML is not stored.

Project names, titles and URLs may contain personal information depending on what you choose to save. Saved URLs can include query parameters. LinkYard does not automatically remove those parameters.

LinkYard processes selected links when you use its collection actions. It does not monitor your browsing in the background, access Chrome's browsing-history database, or retrieve the contents of linked pages.

## How the data is used

The data is used to create and display projects, save and organize links, detect duplicates, search your collection, remember your active project, and generate exports when you request them. Searches run locally.

LinkYard has no advertising, analytics, tracking, telemetry, or remote crash reporting. It does not use collection data for advertising, profiling, credit decisions, or any unrelated purpose.

## Storage and retention

Projects, saved links and the active-project preference are stored in `chrome.storage.local` in your Chrome profile. They remain available across browser sessions until you delete them or uninstall the extension. LinkYard does not use `chrome.storage.sync` or provide cloud synchronization.

When you choose **New Project…** from the context menu, the selected link is temporarily held in Chrome's in-memory `chrome.storage.session`. That entry is removed when the side panel retrieves it; entries older than five minutes are discarded instead of used. Chrome also clears this session storage when the extension is disabled, reloaded or updated, or when the browser restarts.

Search text, form input and selected import file contents are processed in memory rather than saved as a history or file archive. Submitted project and link details, including accepted URLs from TXT imports, become part of your stored collection.

LinkYard does not add its own encryption to stored collections or exported files. Their protection depends on your browser profile, device security and any backups you create.

## Permissions

LinkYard requests five permissions:

- **storage:** to retain projects, links and the active-project preference locally, and temporarily hold a selected link while the new-project dialog opens.
- **contextMenus:** to let you save a selected link to your current project, another project or a new project through Chrome's right-click menu.
- **sidePanel:** to display the interface for managing projects and links alongside the page you are browsing.
- **activeTab:** to temporarily access the page where you invoke LinkYard through its toolbar icon or context menu.
- **scripting:** to read external link URLs and text from that page only when you click **Collect external links**.

The extension requests no persistent host permissions and installs no automatic content scripts on websites. The page link reader runs on demand in an isolated execution environment in the current tab's main frame. It reads links without changing the page or following those links.

## Sharing and actions you control

LinkYard does not sell, share or transmit your stored collections to the developer, advertisers, data brokers or other external services. The developer has no remote access to your collection through the extension.

When you open a saved link or the developer's website, Chrome navigates to that website. The destination receives the normal information associated with your browser visit and handles it under its own privacy policy. LinkYard does not send your project or collection along with that navigation.

When you choose **Copy URL**, the selected URL is placed on your system clipboard. LinkYard does not read the clipboard. When you export a project or your workspace, a JSON or TXT file is generated locally and saved to your chosen download location. These files contain collection data, including source information where present. You control any subsequent sharing or backup of those files.

This policy covers the LinkYard extension. Chrome, the Chrome Web Store, websites you visit and services you use to store or share exported files have their own privacy practices.

## Access, export and deletion

You can view your collections in the side panel, rename projects, move or delete links, delete projects and export individual projects or your entire collection. Deleting a project also deletes its saved links. Uninstalling LinkYard removes its extension storage from Chrome.

Deleting data in LinkYard or uninstalling it does not delete files you previously exported, copies on the clipboard, or backups made outside the extension. Those copies must be removed separately. The developer cannot retrieve or recover collections from your device through LinkYard.

## Chrome Web Store Limited Use

LinkYard's handling of information provided by Google APIs complies with the [Chrome Web Store User Data Policy, including the Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use). This information is used only to provide LinkYard's purpose of collecting and managing links you choose to save.

## Changes to this policy

Updates to this policy will be published in this document with a revised date. Changes to LinkYard's data handling will be reflected here.
