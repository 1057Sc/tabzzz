# Browser-ZZZ 项目 Review 与低耗电改造计划

## 总结

这次 review 的重点是理解项目当前状态，以及定位“耗电量比较高”的主要原因。当前问题不像是某一个死循环导致的，而是多个机制叠加：

- 内容脚本注入到所有网页。
- 侧边栏 iframe 默认偏积极加载。
- 多个入口会触发全量 tab 轮询。
- 轮询会写入 storage 历史记录。
- AI 分类默认启用，并且会定时扫描全部 tab。

建议方向是“体验和省电平衡”：保留侧边栏、刷新按钮、自动休眠这些核心体验，但避免在用户没有主动使用扩展时加载重 UI、扫描全部 tab、写 storage 或运行 AI 推理。

当前验证结果：

- `npm run build` 通过。
- `npx tsc --noEmit` 失败。主要原因包括 Chrome 全局类型未配置、`email` 和 `ai` 分类权重缺失、Chrome AI session 的 null 类型问题。

## 主要发现

### P0：全站侧边栏会放大后台轮询

证据：

- `entrypoints/content.ts` 匹配 `*://*/*`，会注入到所有普通网页。
- 旧版逻辑里，只要本地侧边栏可见标记不是 `false`，侧边栏就会被认为可见。
- 可见时，每个页面都会加载 `left-sidebar.html`。
- `entrypoints/left-sidebar/App.tsx` 在挂载时调用 `api.getState()`。
- `entrypoints/background.ts` 里的 `GET_STATE` 会调用 `MemoryMonitor.poll()`。
- `MemoryMonitor.poll()` 会查询所有 tab、读取分类、计算快照，并把内存历史写入 storage。

影响：

- 用户打开很多网页时，可能同时存在很多个 sidebar iframe。
- 每个 iframe 启动都可能触发一次全量 tab 扫描和 storage 写入。
- 这是当前最可疑的耗电来源。

### P0：轮询和历史写入过于积极

证据：

- `POLL_MEMORY` 每 2 分钟运行一次。
- `POLL_RULES` 也每 2 分钟运行一次。
- tab 激活后会在 2 秒防抖后触发 `MemoryMonitor.poll()`。
- UI 的刷新和初始化路径会调用 `GET_STATE`，而 `GET_STATE` 也会 poll 并写 history。

影响：

- 正常切换 tab、打开 UI、后台 alarm 都会唤醒 service worker。
- 一些本质上只是“读状态”的 UI 操作，也会修改 storage。
- history 里会混入 UI 打开导致的采样，而不只是定时监控采样。

### P0：AI 分类默认行为偏重，而且分类集合不一致

证据：

- `DEFAULT_AI_SETTINGS.provider` 默认是 `chrome`。
- `CLASSIFY_BATCH` 每 5 分钟运行一次。
- `classifyUnclassifiedTabs()` 会扫描全部 tab，并对未分类或过期分类的未 discard tab 做分类。
- prompt 支持 `email` 和 `ai`，但 `VALID_CATEGORIES` 没有包含这两个分类。

影响：

- Chrome 内置 AI 可能在后台被初始化并执行推理。
- 如果模型返回 `email` 或 `ai`，本地校验会丢弃结果，之后可能再次尝试分类。
- 对一个追求低耗电的扩展来说，默认后台 AI 分类太激进。

### P1：初始化可能重复注册监听器

证据：

- `background.ts` 主流程里调用了 `init().then(registerAlarms)`。
- `onInstalled` 和 `onStartup` 也会调用 `init()` 和 `registerAlarms()`。
- `TabLifecycleManager.init()` 每次执行都会注册 tab/window listener。

影响：

- 如果同一个 service worker 生命周期里重复初始化，事件处理、storage 写入、后续轮询触发都可能被放大。
- 这类问题在 MV3 service worker 的唤醒/重启场景下风险较高。

### P1：规则引擎行为和配置语义不完全一致

证据：

- 配置里有 `sleepHighestMemory`，但 `evalMemoryLimitRule()` 实际总是按 eviction priority 排序。
- tab limit 的 `notify` 分支注释写了“单独处理”，但目前没有真正发送通知，同时计数仍会增加。
- 规则评估依赖内存里的 cached snapshots；service worker 重启后如果 cache 为空，规则会直接跳过。

影响：

- 用户选择的自动化策略可能和实际执行不一致。
- service worker 重启后，规则可能在下一次 poll 前静默失效。

## 实施计划

### Phase 1：先停止非必要重活

- 让 `TabLifecycleManager.init()` 幂等，保证同一个 service worker 生命周期里 listener 只注册一次。
- 拆分“读状态”和“主动轮询”：
  - `GET_STATE` 默认返回缓存的 snapshots 和 latest memory。
  - 新增或保留一个明确的“用户主动刷新”路径来触发完整 poll。
  - 默认只有定时 memory poll 才写入 history。
- 给 `MemoryMonitor.poll()` 加一个短 freshness window，让并发 UI 初始化复用同一个 in-flight 或刚完成的结果。
- 移除 tab 激活后的完整 poll，或改成只更新 active tab 缓存并广播轻量状态。

### Phase 2：保留侧边栏体验，但让它更省电

- 内容脚本默认只注入轻量入口按钮，不默认加载 React iframe。
- 只有用户在当前页面打开侧边栏时，才加载 `left-sidebar.html`。
- 可以继续持久化用户的展开/收起偏好，但不要因为偏好是“展开”就在每个网页上立即加载完整 iframe。
- 侧边栏打开后先展示缓存状态，并保留手动刷新按钮。

### Phase 3：AI 分类改成按需或更保守

- 默认把 AI provider 改为 `disabled`，或者至少让后台分类必须由显式设置开启。
- 如果保留默认 AI 开启，也应只在用户启用自动分组、或点击 classify/group 时运行。
- 增加分类失败退避和单轮最大处理数量。
- 把 `email` 和 `ai` 补进 `VALID_CATEGORIES` 和 `CATEGORY_WEIGHTS`。
- 普通后台路径不要仅为了检查可用性就创建 Chrome AI session。

### Phase 4：修正规则语义和工程健康

- `sleepHighestMemory` 应按估算内存从高到低排序候选 tab。
- `notify` 要么真正实现通知，要么不要把它当作已执行动作计数。
- 规则评估在 cache 为空时可以获取新快照，但不要因此重复写 history。
- 修复 TypeScript 校验：
  - 添加 Chrome extension 类型，或统一使用 WXT 的 browser 类型。
  - 修复 `ChromeAIProvider.getSession()` 的 nullability。
  - 补齐 `email` 和 `ai` 分类权重。
  - 等 `npx tsc --noEmit` 通过后，在 `package.json` 增加 `typecheck` script。

## 测试计划

- 构建验证：
  - `npm run build`
- 类型验证：
  - `npx tsc --noEmit`
- 手动扩展验证：
  - 打开多个普通网站，确认左侧 React iframe 不会在用户打开前自动加载。
  - 打开 popup 和 sidepanel，确认默认从缓存渲染，不会每次打开都写 memory history。
  - 快速切换多个 tab，确认不会每次激活都触发完整 poll。
  - 点击手动刷新，确认 snapshots 仍能正确更新。
  - 手动启用 AI 分类，确认 `email` 和 `ai` tab 能被保存，不会反复重试。
  - 重载扩展后，确认 service worker 醒来时规则仍能正常评估。

## 假设

- `review/` 是项目 review 文档目录。
- 产品目标是平衡体验和省电：保留快速入口和有用的实时状态，但避免默认重型后台工作。
- 本文档阶段不修改业务代码，只记录 review 结论和后续实施计划。
