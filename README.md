# TabZZZ

TabZZZ is a low-distraction Chrome extension for people who keep many tabs open and want Chrome to feel lighter without constantly managing tabs by hand.

It uses Chrome's native tab discard mechanism to sleep inactive tabs, shows the current state in Chrome's native side panel, and keeps the extension footprint small by avoiding page-level content scripts.

## Current Features

- **Native tab sleeping**: Sleeps inactive tabs with `chrome.tabs.discard()`.
- **Low-power architecture**: Uses a Manifest V3 background service worker and Chrome's native side panel. No content scripts are injected into webpages.
- **Conservative auto recycle**: Keeps active, pinned, grouped, audio/video, protected, and configured never-sleep sites awake.
- **Estimated memory view**: Shows local memory-pressure estimates and sleeping tab counts.
- **Native side panel UI**: Manage current tabs, sleeping tabs, forgotten tabs, and lightweight configuration from one panel.
- **Configurable entry mode**: Use Chrome's native side panel by default, or open TabZZZ as a toolbar popup.
- **Close sleeping tabs**: Batch-close already sleeping tabs with a same-button second-click confirmation.
- **Never sleep sites**: Protect important domains such as local dev hosts and AI assistant sites.
- **Event-driven panel sync**: When the side panel is open, tab changes are debounced and synced without writing memory history.

## Design Principles

- Keep the core job simple: reduce tab memory pressure.
- Prefer Chrome native capabilities over page injection.
- Avoid adding UI to every webpage.
- Keep background work event-driven and conservative.
- Treat per-tab memory as an estimate, not an exact measurement.

## How It Works

TabZZZ periodically samples Chrome tab metadata and system memory information, estimates tab memory pressure locally, and applies conservative rules before sleeping inactive tabs.

The extension intentionally does not inject a sidebar or script into every webpage. The main UI is the native Chrome side panel, and the toolbar badge shows how many tabs are currently sleeping.

## Protected Tabs

By default, TabZZZ will not automatically sleep:

- the current active tab
- pinned tabs
- tabs inside Chrome tab groups
- audible audio/video tabs
- Chrome/system/extension pages
- domains listed in **Never sleep these sites**

The default never-sleep list includes local development hosts and common AI assistant sites:

- `localhost`
- `127.0.0.1`
- `::1`
- `*.local`
- `*.localhost`
- `claude.ai`
- `chatgpt.com`
- `gemini.google.com`

You can remove or add entries from the side panel config.

## Limitations

- Chrome does not expose exact memory usage for every individual tab through normal extension APIs, so per-tab memory is estimated.
- Sleeping a tab frees memory, but revisiting it may reload the page.
- Grouped and pinned tabs are protected intentionally, so TabZZZ may choose to sleep fewer tabs rather than surprise the user.
- AI classification code exists in the project, but the current public-facing experience is focused on lightweight memory management.

## Install Locally

### Prerequisites

- Node.js 18+
- npm
- Chrome or a Chromium-based browser with extension developer mode

### Development

```bash
npm install
npm run dev
```

WXT will start a development build and open a Chrome instance for extension testing.

### Load an Unpacked Production Build

```bash
npm install
npm run build
```

Then open Chrome:

1. Go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3`.

## Permissions

TabZZZ asks for a small set of Chrome extension permissions:

- `tabs`: read tab metadata and sleep/wake tabs.
- `tabGroups`: detect Chrome tab groups and protect grouped tabs.
- `storage`: store rules, activity timestamps, and memory history.
- `alarms`: run conservative periodic checks.
- `system.memory`: read system memory information for pressure estimates.
- `sidePanel`: provide the native Chrome side panel UI.

There are no content scripts in the current build.

## Privacy

TabZZZ stores its settings and tab activity metadata locally through Chrome extension storage. It does not inject scripts into webpages and does not send browsing data to a remote server in the current public build.

See [PRIVACY.md](PRIVACY.md) for details.

## Build Checks

```bash
npm run typecheck
npm run build
```

The production build is generated in `.output/chrome-mv3`.

## Release Package

To create a zip file that can be attached to a GitHub Release or uploaded to the Chrome Web Store:

```bash
npm run package:chrome
```

The zip file is generated under `.output/`, for example:

```text
.output/tabzzz-1.2.0-chrome.zip
```

The zip contains `manifest.json` at the root, which is the format Chrome expects.

## Tech Stack

- [WXT](https://wxt.dev/)
- Manifest V3
- React 19
- Tailwind CSS v4
- Heroicons
- Recharts

## License

MIT
