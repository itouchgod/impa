# AGENTS.md — AI Agent 协作指南

本文档面向 AI 编码助手（Claude、Cursor、Copilot 等），提供在本仓库工作所需的完整上下文。

---

## 项目概述

**IMPA Marine Stores Guide PDF 搜索平台**

面向船员/船务采购人员的内部工具，对 IMPA Marine Stores Guide 第 8 版（2023）进行 IMPA 编码与产品名搜索。原始 PDF 约 471MB、1504 页，已按章节拆分为 39 个子文件存放于 `public/pdfs/sections/`。平台构建时生成 `public/search-index.json`，浏览器端加载轻量索引即时搜索，支持跨章节结果跳转、暗色模式和 PWA 安装。

**部署**：Vercel，Hong Kong（hkg1）区域  
**访问权限**：仅供内部使用（Internal Use Only）

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 15.5.3 |
| UI | React + TypeScript | React 19.1.0 / TS ^5 |
| 样式 | Tailwind CSS | v4（postcss 插件，无配置文件） |
| PDF 渲染 | PDF.js | pdfjs-dist ^3.11.174 |
| 图标 | Lucide React | ^0.544.0 |
| 部署 | Vercel | standalone 输出模式 |

> **注意**：Tailwind v4 使用 `@tailwindcss/postcss` 插件，**没有** `tailwind.config.js` 文件，CSS 变量在 `src/app/globals.css` 中定义。

---

## 目录结构

```
impa/
├── middleware.ts              # CSP nonce 生成（每次请求随机）
├── next.config.ts             # webpack 配置、standalone 输出
├── scripts/
│   └── generate-search-index.mjs # 构建时生成 public/search-index.json
├── vercel.json                # 部署区域、响应头、rewrite
├── public/
│   ├── pdfs/sections/         # 39 个章节 PDF（静态文件，约 400MB）
│   ├── search-index.json      # 预构建 IMPA 编码搜索索引（约 233KB）
│   ├── pdf.worker.min.js      # PDF.js worker（从 node_modules 复制）
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service Worker（离线缓存）
└── src/
    ├── app/
    │   ├── layout.tsx         # 根布局：Provider 注入、CSP 早期脚本、SW 注册
    │   ├── page.tsx           # 首页（/）：搜索框 + 常用关键词
    │   ├── search/page.tsx    # 搜索结果页（/search）：PDF 查看器 + 搜索面板
    │   └── globals.css        # 全局样式、CSS 变量（主题色、字体）
    ├── components/
    │   ├── PDFViewer.tsx      # PDF.js canvas 渲染器，暴露 jumpToPage ref
    │   ├── SmartSearchBox.tsx # 搜索框：使用预构建索引即时搜索
    │   ├── SearchResultsOnly.tsx  # 搜索结果列表（右侧面板）
    │   ├── DraggableFloatingButton.tsx  # 可拖拽翻页浮钮（桌面端）
    │   ├── PDFSelector.tsx    # 章节下拉选择器
    │   ├── LoadingScreen.tsx  # 旧 PDF 全文加载进度界面（首页不再使用）
    │   ├── ThemeToggle.tsx    # 浅色/深色/跟随系统切换
    │   ├── ExtensionGuard.tsx # 浏览器扩展防护组件（无渲染内容）
    │   ├── NoSSR.tsx          # 禁止 SSR 包装器，避免 hydration 错误
    │   ├── PDFErrorBoundary.tsx  # PDF 渲染错误边界
    │   └── DevToolsInit.tsx   # 开发环境控制台工具初始化
    ├── contexts/
    │   ├── SearchIndexContext.tsx # 预构建搜索索引加载状态
    │   ├── PDFTextContext.tsx  # 旧全量 PDF 文本加载 Context（当前搜索不使用）
    │   └── ThemeContext.tsx    # 主题状态管理
    ├── config/
    │   └── pdf.ts             # 所有章节的配置数组（路径、页码范围、分类）
    ├── lib/
    │   ├── searchIndex.ts      # search-index.json 客户端加载、缓存和查询
    │   ├── cache.ts           # CacheManager（IndexedDB 优先，降级 localStorage）
    │   ├── performance.ts     # PerformanceMonitor（单例，开发环境日志）
    │   ├── extensionGuard.ts  # 扩展防护核心逻辑（suppressions + DOM 保护）
    │   ├── pdfjs-config.ts    # PDF.js 懒加载单例
    │   ├── devTools.ts        # window.devTools（仅开发环境）
    │   └── buttonStyles.ts    # 悬浮按钮玻璃效果样式工具函数
    ├── types/
    │   ├── pdf.ts             # Section、PageInfo、SectionChangeHandler 类型
    │   └── pdfjs-dist.d.ts    # PDF.js 类型补丁
    └── utils/
        └── pageCalculator.ts  # PageCalculator 类：绝对页码 ↔ 相对页码换算
```

---

## 核心架构概念

### 1. 页码系统（关键）

本项目存在两套页码，混淆它们会导致难以排查的 bug。

| 概念 | 说明 | 示例 |
|------|------|------|
| **绝对页码** (absolutePage) | 在原始 1504 页 PDF 中的位置，有效范围 39–1406 | 第 274 页 |
| **相对页码** (relativePage) | 在当前章节 PDF 文件中的页码，从 1 开始 | 第 1 页（同一内容） |

`PageCalculator` 类是唯一权威的换算工具，**不要手动计算**：

```typescript
// 根据 PDF 路径获取计算器
const calc = PageCalculator.fromPath('/pdfs/sections/31-Safety_Protective_Gear.pdf');

calc.toRelativePage(274);    // absolutePage → relativePage（传给 PDF.js）
calc.toAbsolutePage(1);      // relativePage → absolutePage（显示给用户）
calc.getTotalPages();         // 该章节总页数
calc.isValidAbsolutePage(n); // 边界检查

// 根据绝对页码找章节
PageCalculator.findPageInfo(500); // → { section, relativePage, absolutePage }
```

`PDFViewer` 接收**相对页码**（PDF.js 从 1 开始计数）；搜索结果中存储**绝对页码**；用户界面显示**绝对页码**。

### 2. 章节配置（pdf.ts）

`PDF_CONFIG.sections` 数组是整个应用的数据骨干。每条记录：

```typescript
{
  name: '31-Safety_Protective_Gear',   // 唯一 key，对应文件名
  title: '31, Safety Protective Gear', // 显示名称
  filePath: '/pdfs/sections/31-Safety_Protective_Gear.pdf',
  description: '安全防护装备',
  category: '安全设备',
  startPage: 274,   // 绝对页码起始
  endPage: 298,     // 绝对页码结束
  size: '8.7MB'
}
```

大章节分为 `_part1` / `_part2`：33、59、61、75、79 各有两个文件。  
修改章节范围时**必须同步更新** `startPage`/`endPage`，否则 `PageCalculator` 将计算错误。

### 3. 预构建搜索索引流程

搜索不再在浏览器端下载 400MB 章节 PDF 并提取全文。构建时脚本会预先提取 IMPA 编码，生成轻量 JSON：

```
npm run build / npm run build:index
  → scripts/generate-search-index.mjs
  → 读取 src/config/pdf.ts 的章节页码配置
  → 校验 public/pdfs/sections/accurate-split-info.json
  → 使用 pdfjs-dist 在 Node.js 中逐章节提取 6 位 IMPA 编码
  → 按章节前缀过滤假阳性（00_10 章节允许 00 和 10）
  → 输出 public/search-index.json

浏览器加载
  → SearchIndexProvider 调用 loadSearchIndex()
  → fetch('/search-index.json')
  → localStorage 缓存（key: impa_search_index_v1）
  → SmartSearchBox 调用 searchIndex(index, query, 100)
  → SearchResultsOnly 渲染编码徽章、描述、页码、章节和复制按钮
```

`search-index.json` 条目格式：

```typescript
{
  code: '310311',                    // 6 位 IMPA 编码
  name: 'Harness ...',               // 产品描述，可能为空
  page: 276,                         // 绝对页码
  relativePage: 3,                   // 当前章节内页码
  sectionName: '31-Safety_Protective_Gear',
  filePath: '/pdfs/sections/31-Safety_Protective_Gear.pdf'
}
```

`PDFTextContext` 仍保留为兼容旧加载界面/后续高亮能力的旧路径，但不再是首页或全局搜索的数据源。不要在首页调用 `PDFTextProvider.startLoading()`，否则会重新触发旧的全章节 PDF 文本提取路径。

### 4. CSP 与 Nonce 机制

`middleware.ts` 为每个请求生成随机 nonce，放入响应头 `x-nonce`。  
`layout.tsx` 读取 nonce（需 `await headers()`），注入到两个内联 `<Script>` 标签。  
`<body>` 上有 `data-nonce={nonce}` 供客户端读取。

**注意**：`layout.tsx` 中 `export const dynamic = "force-dynamic"` 是必须的，否则 `headers()` 在静态渲染时报错。

### 5. 浏览器扩展防护

因 Chext、YouTube 等扩展会干扰 PDF.js 渲染，项目有两层防护：

- **早期脚本**（`layout.tsx` 中 `beforeInteractive`）：在 React 挂载前拦截 `console.error/warn` 和 `window.onerror`
- **ExtensionGuard 组件** + `extensionGuard.ts`：挂载后持续监听，使用 MutationObserver 隔离扩展注入的 DOM

不要轻易修改这两层防护的关键词列表，除非确认新扩展造成了问题。

### 6. 跨章节翻页

当用户在某章节末页点击"下一页"时，`handleCrossSectionKeyNavigation` 函数自动切换到下一个章节的第一页。章节顺序以 `PDF_CONFIG.sections` 数组为准。

---

## 开发命令

```bash
npm run dev          # 启动开发服务器（http://localhost:3000）
npm run build:index  # 生成 public/search-index.json
npm run build        # 生产构建（standalone 模式）
npm run start        # 本地运行生产构建
npm run lint         # ESLint 检查
npm run deploy       # 部署到 Vercel 生产环境
npm run deploy:preview  # 部署预览版本
```

---

## 常见修改场景

### 添加/修改 PDF 章节

1. 将 PDF 文件放入 `public/pdfs/sections/`
2. 在 `src/config/pdf.ts` 的 `sections` 数组中添加/修改对应条目
3. 确保 `startPage`/`endPage` 与其他章节不重叠
4. 大章节（>50MB）需拆分为 `_part1`/`_part2`，分别配置连续的页码范围
5. 更新 `fileInfo.totalPages`（实际章节覆盖页数）

### 修改搜索逻辑

搜索入口：`src/components/SmartSearchBox.tsx` → `searchInAllSections()`  
搜索源：`SearchIndexContext` 提供的 `index`，查询函数在 `src/lib/searchIndex.ts`。
结果格式：`SmartSearchResult`（`src/types/pdf.ts` 未定义，定义在 SmartSearchBox 内部）

纯数字 5–7 位查询按 IMPA 编码精确/前缀匹配；文字查询按编码、产品描述和章节名多词匹配。`SmartSearchBox` 有 300ms 防抖即时搜索，输入纯数字时显示 `CODE` 模式标识。

### 修改 PDF 渲染

`PDFViewer.tsx`：canvas 渲染，通过 `forwardRef` 暴露 `jumpToPage(n: number)`。  
传入的 `pdfUrl` 为相对路径（`/pdfs/sections/xxx.pdf`），`initialPage` 为**相对页码**。

### 修改 UI 主题

CSS 变量定义在 `src/app/globals.css`，Tailwind 类如 `bg-background`、`text-foreground` 等对应这些变量。  
`ThemeContext` 管理 `light`/`dark`/`system` 三种状态，通过在 `<html>` 元素切换 class 实现。

### 修改缓存策略

`src/lib/cache.ts`（`CacheManager`）：IndexedDB 优先，降级 localStorage。  
`src/lib/searchIndex.ts`：索引缓存配置（`CACHE_KEY = impa_search_index_v1`、`CACHE_VERSION = 1.0`）。
`src/contexts/PDFTextContext.tsx`：旧 PDF 文本缓存配置（`CACHE_VERSION`、`CACHE_EXPIRY_DAYS`），不要为了搜索修改它。
修改搜索索引的 `CACHE_VERSION` 会使用户重新下载 `search-index.json`；修改 PDF 文本缓存版本会触发旧 PDF 文本缓存失效。

---

## 已知问题与注意事项

### Hydration 错误
- 所有访问 `localStorage`/`window` 的逻辑必须在 `useEffect` 或 `mounted` 状态检查后执行
- `SearchIndexContext` 和 `PDFTextContext` 均用挂载状态控制服务端/客户端渲染差异
- `NoSSR` 组件包裹首页，确保只在客户端渲染

### PDF.js Worker
- `public/pdf.worker.min.js` 必须与 `pdfjs-dist` 版本匹配
- 生产环境通过 `PDFViewer` 中 `import('@/lib/pdfjs-config')` 懒加载
- `PDFTextContext` 中使用 `import('pdfjs-dist/webpack')` 加载
- `scripts/generate-search-index.mjs` 在 Node.js 中加载 `pdfjs-dist/legacy/build/pdf.js`，需兼容 CJS `default` 导出

### 性能
- 首页和搜索页只需下载 `public/search-index.json`，当前约 233KB
- 不要在首页触发 `PDFTextProvider.startLoading()`，否则会回到旧的 400MB PDF 全量提取路径
- 生产构建 webpack 将 pdfjs-dist 分割为独立 chunk（`pdfjs` cacheGroup）

### 搜索索引覆盖范围
- `45-Petroleum_Products` 当前索引为 0 条：该章节 PDF 近似图像型扫描页，PDF.js 无法可靠提取 `45xxxx` 编码，用户需直接翻页查看
- 部分章节描述可能为空，这是源 PDF 文本层质量导致的；编码、页码和章节跳转仍可用

### TypeScript
- `pdfjs-dist` 的部分 API 使用 `any` 类型（`pdf.getPage(n)`、`textContent.items`）
- `window` 对象的扩展属性（`devTools`）在 `devTools.ts` 中有全局声明

### Vercel 限制
- 静态文件限制单文件 100MB，大章节须拆分（已处理）
- `vercel.json` 中 `regions: ["hkg1"]` 固定了部署区域

---

## 文件修改风险等级

| 文件 | 风险 | 说明 |
|------|------|------|
| `src/config/pdf.ts` | ⚠️ 高 | 页码错误会导致跳转失效，全局影响 |
| `middleware.ts` | ⚠️ 高 | CSP 配置错误会阻断所有脚本执行 |
| `scripts/generate-search-index.mjs` | ⚠️ 高 | 索引生成错误会影响全站搜索覆盖率 |
| `src/lib/searchIndex.ts` | ⚠️ 高 | 查询、缓存和运行时校验逻辑，错误会影响所有搜索 |
| `src/contexts/PDFTextContext.tsx` | 🔶 中 | 旧全量文本加载路径，避免重新接入首页搜索 |
| `src/utils/pageCalculator.ts` | ⚠️ 高 | 页码换算逻辑核心，错误影响全局 |
| `src/app/layout.tsx` | 🔶 中 | 早期防护脚本、nonce 注入、Provider 顺序 |
| `src/components/PDFViewer.tsx` | 🔶 中 | canvas 渲染逻辑，触发 re-render 可能导致闪烁 |
| `public/pdfs/sections/` | 🟢 低 | 静态文件，修改需同步更新 pdf.ts 配置 |
| `src/lib/extensionGuard.ts` | 🔶 中 | 关键词列表影响哪些错误被静默处理 |

---

## 版本命名规范

提交信息遵循 `V{YY}.{MM}.{序号}.{子版本}-{描述}` 格式，例如 `V25.10.3.0.-vercel-ok`。

---

## 不要做的事

- **不要**在 `src/config/pdf.ts` 中手动计算 `startPage`/`endPage`，需从分割脚本（`scripts/accurate-split-pdf.py`）的输出中获取
- **不要**删除或修改 `public/pdf.worker.min.js`（需与 pdfjs-dist 版本匹配）
- **不要**在 Server Component 中使用 `localStorage` 或 `window`
- **不要**移除 `layout.tsx` 中的 `export const dynamic = "force-dynamic"`
- **不要**在 `middleware.ts` 的 CSP 中直接允许 `unsafe-inline`（会使 nonce 失效）
- **不要**修改 `CACHE_VERSION` 除非确实需要清除所有用户缓存

## Imported Claude Cowork project instructions
