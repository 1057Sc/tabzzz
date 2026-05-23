# TabZZZ

TabZZZ is a lightweight Chrome tab memory manager for people who keep many tabs open and want Chrome to feel lighter without constantly managing tabs by hand.

[English](#english) | [中文](#chinese)

<a id="english"></a>

## English

### What is TabZZZ?

TabZZZ helps reduce Chrome tab memory pressure with Chrome's native tab discard capability. It is designed around two product principles:

- **Low power**: prefer Chrome native extension APIs, Manifest V3 service worker behavior, and event-driven updates.
- **Low distraction**: keep the UI quiet, protect important tabs by default, and avoid asking users to manually manage every tab.

TabZZZ does not inject scripts into webpages, does not add a custom sidebar to every page, and does not modify webpage titles.

### Core Capabilities

- **Auto sleep**: Sleep inactive tabs with Chrome's native discard mechanism.
- **Protected work**: Keep active work, pinned tabs, grouped tabs, audio tabs, and configured sites like AI chat pages awake.
- **Quick cleanup**: Group forgotten tabs and batch-close sleeping tabs when they are no longer needed.
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

TabZZZ 是一个轻量的 Chrome 标签页内存管理扩展，适合每天打开很多 tab、希望 Chrome 变轻一点、但又不想频繁手动整理标签页的人。

它的核心思路很简单：

- **低能耗**：优先使用 Chrome 原生扩展能力、Manifest V3 service worker 和事件驱动更新。
- **轻打扰**：默认保护重要页面，界面尽量安静，尽量少让用户感知它的存在。

TabZZZ 不往网页里注入脚本，不在每个网页里塞自定义侧边栏，也不会修改网页标题。

### 核心能力

- **自动睡眠**：使用 Chrome 原生 discard 机制休眠不活跃标签页。
- **保护工作现场**：默认保护当前工作、pinned tabs、grouped tabs、音频标签，以及 AI Chat 等可配置的指定网站。
- **快速清理**：聚合遗忘标签，并支持批量关闭已经 sleeping 的 tabs。
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
