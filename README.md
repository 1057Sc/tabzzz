# TabZZZ

TabZZZ is a lightweight Chrome tab memory manager for people who keep many tabs open, but only need the recent and fixed ones awake.

[English](#english) | [中文](#chinese)

<a id="english"></a>

## English

### What is TabZZZ?

Modern browser work keeps getting heavier: AI chats, docs, dashboards, developer tools, and long-lived web apps can leave Chrome carrying more tabs and processes than your memory, and your attention, should have to hold.

TabZZZ helps reduce Chrome tab memory pressure with Chrome's native tab discard capability. It is for people who may keep Chrome at 20GB+ with dozens of open tabs, while realistically only following the last hour of work and a few fixed sites.

The goal is light resource and attention relief: let tabs you are not looking at sleep, keep the current working set awake, then batch-close the idle or sleeping pages when you are ready to clear the clutter.

It is designed around four product principles:

- **Resource relief**: sleep tabs outside your recent or fixed working set.
- **Attention relief**: surface forgotten and sleeping tabs without asking you to constantly organize everything by hand.
- **Low distraction**: protect active tabs, pinned tabs, grouped tabs, audio tabs, and configured Never Sleep sites by default.
- **Native and local**: use Chrome native discard, Chrome-native UI, local storage, and no webpage injection.

TabZZZ does not inject scripts into webpages, does not add a custom sidebar to every page, and does not modify webpage titles.

### Core Capabilities

- **Auto sleep**: Sleep inactive tabs with Chrome's native discard mechanism.
- **Protected working set**: Keep recent work, pinned tabs, grouped tabs, audio tabs, and configured sites like AI chat pages awake. The default inactivity threshold is 1 hour and can be adjusted.
- **Forgotten tab review**: Surface tabs that have been inactive for a long time so you can decide what to keep.
- **Batch cleanup**: Close sleeping tabs in bulk when they are no longer needed.
- **Conservative behavior**: Prefer sleeping fewer tabs over surprising you.
- **Low footprint**: Run through Chrome-native UI, local storage, and no webpage injection.

### Install Locally

#### Prerequisites

- Node.js 18+
- npm
- Chrome or a Chromium-based browser with extension developer mode

#### Development

```bash
npm install
npm run dev
```

WXT starts a development build and opens a Chrome instance for extension testing.

#### Load an Unpacked Production Build

```bash
npm install
npm run build
```

Then open Chrome:

1. Go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `.output/chrome-mv3`.

### Release Package

Create a zip file for GitHub Releases or Chrome Web Store upload:

```bash
npm run package:chrome
```

The zip file is generated under `.output/`, for example:

```text
.output/tabzzz-1.2.0-chrome.zip
```

The zip contains `manifest.json` at the root, which is the format Chrome expects.

### Permissions

TabZZZ requests a small set of Chrome extension permissions:

- `tabs`: read tab metadata and sleep/wake tabs.
- `tabGroups`: detect Chrome tab groups and protect grouped tabs.
- `storage`: store settings, activity timestamps, and memory history locally.
- `alarms`: run conservative periodic checks.
- `system.memory`: read system memory information for pressure estimates.
- `sidePanel`: provide the native Chrome side panel UI.

There are no content scripts, no default popup, and no webpage-injected UI in the current build.

See [PRIVACY.md](PRIVACY.md) for details.

### Limitations

- Per-tab memory usage is estimated, not exact.
- A sleeping tab may reload when visited again.
- TabZZZ intentionally protects pinned, grouped, active, audible, and configured Never Sleep tabs, so it may choose to sleep fewer tabs rather than surprise the user.

### Tech Stack

- [WXT](https://wxt.dev/)
- Manifest V3
- React 19
- Tailwind CSS v4
- Heroicons
- Recharts

### License

MIT

<a id="chinese"></a>

## 中文

### TabZZZ 是什么？

TabZZZ 是一个轻量的 Chrome 标签页内存管理扩展，适合每天打开很多 tabs，但真正关注的只是最近一小时和少数固定页面的人。

现在很多工作都在浏览器里完成，AI chat、文档、控制台、dashboard、长期打开的 Web app 越来越多。Chrome 可能背着几十个暂时不看的页面占用 20GB+ 内存，而这些 tabs 也早就超过了人当天真正能阅读和处理的范围。

TabZZZ 做的是一件轻量的事：让暂时不关注的 tabs 先睡着，把资源和注意力留给当前真正需要的页面；等你确认不再需要时，再批量关闭这些闲置或已睡眠的页面，把资源占用和注意力负担一起清掉。

它的核心思路很简单：

- **资源减压**：让最近工作集和固定页面之外的 tabs 进入睡眠。
- **注意力减压**：把遗忘的、已经睡眠的 tabs 集中展示出来，但不要求你持续手动整理所有东西。
- **轻打扰**：默认保护 active tabs、pinned tabs、grouped tabs、音频标签，以及配置过的 Never Sleep 站点。
- **原生和本地**：使用 Chrome 原生 discard、Chrome 原生界面、本地存储，不向网页注入脚本。

TabZZZ 不往网页里注入脚本，不在每个网页里塞自定义侧边栏，也不会修改网页标题。

### 核心能力

- **自动睡眠**：使用 Chrome 原生 discard 机制休眠不活跃标签页。
- **保护工作现场**：保护最近工作、pinned tabs、grouped tabs、音频标签，以及 AI Chat 等可配置的指定网站。默认不活跃阈值是 1 小时，可调整。
- **遗忘标签回顾**：集中展示长时间不活跃的 tabs，方便你决定哪些还需要保留。
- **批量清理**：支持批量关闭已经 sleeping 的 tabs。
- **保守执行**：宁愿少 sleep 一些 tabs，也尽量不打断你的工作现场。
- **低负担运行**：使用 Chrome 原生界面、本地存储，不向网页注入脚本。

### 本地安装

#### 前置要求

- Node.js 18+
- npm
- Chrome 或其他支持扩展开发者模式的 Chromium 浏览器

#### 开发模式

```bash
npm install
npm run dev
```

WXT 会启动开发构建，并打开一个用于测试扩展的 Chrome 实例。

#### 加载生产构建

```bash
npm install
npm run build
```

然后打开 Chrome：

1. 进入 `chrome://extensions`。
2. 打开 **Developer mode**。
3. 点击 **Load unpacked**。
4. 选择 `.output/chrome-mv3`。

### GitHub Release 包

生成可用于 GitHub Release 或 Chrome Web Store 上传的 zip：

```bash
npm run package:chrome
```

zip 会生成在 `.output/` 目录下，例如：

```text
.output/tabzzz-1.2.0-chrome.zip
```

这个 zip 的根目录包含 `manifest.json`，符合 Chrome 期望的上传格式。

### 权限说明

TabZZZ 使用少量 Chrome 扩展权限：

- `tabs`：读取 tab 元数据，并 sleep/wake tabs。
- `tabGroups`：识别 Chrome tab groups，并保护 grouped tabs。
- `storage`：在本地保存配置、活跃时间戳和内存历史。
- `alarms`：执行保守的周期检查。
- `system.memory`：读取系统内存信息，用于压力估算。
- `sidePanel`：提供 Chrome 原生 side panel UI。

当前构建没有 content scripts，没有 default popup，也没有注入到网页里的 UI。

更多细节见 [PRIVACY.md](PRIVACY.md)。

### 限制

- 每个 tab 的内存占用是估算值，不是精确值。
- sleeping tab 重新访问时可能会 reload。
- TabZZZ 会刻意保护 pinned、grouped、active、audible 和 Never Sleep tabs，所以它宁愿少 sleep 一些 tabs，也不做容易打扰用户的事情。

### 技术栈

- [WXT](https://wxt.dev/)
- Manifest V3
- React 19
- Tailwind CSS v4
- Heroicons
- Recharts

### License

MIT
