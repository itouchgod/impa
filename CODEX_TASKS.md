# CODEX_TASKS.md — 优化执行指令

> **执行方**：AI 编码 Agent（Codex / Claude Code / Cursor）  
> **验证方**：Claude（对每个 Task 完成后进行代码审查和功能测试）  
> **核心目标**：将站点从「每次下载 400MB PDF 才能搜索」升级为「下载 1MB 预构建索引，即时搜索」
>
> 按 Task 编号顺序执行，每个 Task 完成后等待验证再进入下一个。

---

## 背景与诊断

### 当前架构问题

| 问题 | 严重程度 | 说明 |
|------|---------|------|
| 首次加载下载 400MB PDF | 🔴 严重 | 用户等待数分钟才能搜索 |
| localStorage 缓存 7 天过期后重复下载 | 🔴 严重 | 每周重复一次 400MB 下载 |
| 浏览器内 CPU 密集型文本提取 | 🟠 高 | 移动端尤其卡顿 |
| 搜索无 IMPA 编码结构感知 | 🟠 高 | 6位编码与产品名无区分处理 |
| 搜索需按回车触发（无即时反馈） | 🟡 中 | 用户体验差 |
| 无双向查询 UI（编码↔产品名） | 🟡 中 | 核心需求缺失 |

### 关键已知事实

- **IMPA 编码格式**：6位数字，前2位为章节号（如 `310311` 属于 Section 31）
- **文本可提取性**：编码可靠，产品描述部分乱码
- **pdfjs-dist** 已在 `dependencies` 中，可在 Node.js 构建时使用
- **章节配置**在 `src/config/pdf.ts`，startPage/endPage 为绝对页码

---

## TASK 1：预构建搜索索引（构建时）

**目的**：构建时提取所有 IMPA 编码和描述，生成 `public/search-index.json`，彻底消除客户端 400MB 下载。

### 1.1 创建索引生成脚本

创建文件 `scripts/generate-search-index.mjs`：

```javascript
#!/usr/bin/env node
/**
 * 预构建 IMPA 搜索索引
 * 运行: node scripts/generate-search-index.mjs
 * 输出: public/search-index.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// 从 pdf.ts 读取章节配置（动态 import 或直接读取 json）
const splitInfo = JSON.parse(
  readFileSync(join(ROOT, 'public/pdfs/sections/accurate-split-info.json'), 'utf-8')
);

// 与 src/config/pdf.ts 的 sections 数组保持同步
// 直接从 accurate-split-info.json 读取，避免 TS 依赖
const SECTIONS_MAP = {};
// 从 pdf.ts 的 sections 数组中提取 startPage 信息
// 由于 json 中没有 startPage，需要从 pdf.ts 导入
// 暂时内联章节页码配置（与 src/config/pdf.ts 完全一致）
const SECTION_PAGES = {
  '15-Cloth_Linen_Products':                       { start: 39,   end: 48,   filePath: '/pdfs/sections/15-Cloth_Linen_Products.pdf' },
  '17-Tableware_Galley_Utensils':                  { start: 49,   end: 118,  filePath: '/pdfs/sections/17-Tableware_Galley_Utensils.pdf' },
  '19-Clothing':                                   { start: 119,  end: 131,  filePath: '/pdfs/sections/19-Clothing.pdf' },
  '21-Rope_Hawsers':                               { start: 132,  end: 178,  filePath: '/pdfs/sections/21-Rope_Hawsers.pdf' },
  '23-Rigging_Equipment_General_Deck_Items':       { start: 179,  end: 244,  filePath: '/pdfs/sections/23-Rigging_Equipment_General_Deck_Items.pdf' },
  '25-Marine_Paint':                               { start: 245,  end: 260,  filePath: '/pdfs/sections/25-Marine_Paint.pdf' },
  '27-Painting_Equipment':                         { start: 261,  end: 273,  filePath: '/pdfs/sections/27-Painting_Equipment.pdf' },
  '31-Safety_Protective_Gear':                     { start: 274,  end: 298,  filePath: '/pdfs/sections/31-Safety_Protective_Gear.pdf' },
  '33-Safety_Equipment_part1':                     { start: 299,  end: 356,  filePath: '/pdfs/sections/33-Safety_Equipment_part1.pdf' },
  '33-Safety_Equipment_part2':                     { start: 357,  end: 415,  filePath: '/pdfs/sections/33-Safety_Equipment_part2.pdf' },
  '35-Hose_Couplings':                             { start: 416,  end: 438,  filePath: '/pdfs/sections/35-Hose_Couplings.pdf' },
  '37-Nautical_Equipment':                         { start: 439,  end: 485,  filePath: '/pdfs/sections/37-Nautical_Equipment.pdf' },
  '39-Medicine':                                   { start: 486,  end: 526,  filePath: '/pdfs/sections/39-Medicine.pdf' },
  '45-Petroleum_Products':                         { start: 527,  end: 545,  filePath: '/pdfs/sections/45-Petroleum_Products.pdf' },
  '47-Stationery':                                 { start: 546,  end: 574,  filePath: '/pdfs/sections/47-Stationery.pdf' },
  '49-Hardware':                                   { start: 575,  end: 601,  filePath: '/pdfs/sections/49-Hardware.pdf' },
  '51-Brushes_Mats':                               { start: 602,  end: 615,  filePath: '/pdfs/sections/51-Brushes_Mats.pdf' },
  '53-Lavatory_Equipment':                         { start: 616,  end: 629,  filePath: '/pdfs/sections/53-Lavatory_Equipment.pdf' },
  '55-Cleaning_Material_Chemicals':                { start: 630,  end: 664,  filePath: '/pdfs/sections/55-Cleaning_Material_Chemicals.pdf' },
  '59-Pneumatic_Electrical_Tools_part1':           { start: 665,  end: 709,  filePath: '/pdfs/sections/59-Pneumatic_Electrical_Tools_part1.pdf' },
  '59-Pneumatic_Electrical_Tools_part2':           { start: 710,  end: 755,  filePath: '/pdfs/sections/59-Pneumatic_Electrical_Tools_part2.pdf' },
  '61-Hand_Tools_part1':                           { start: 756,  end: 808,  filePath: '/pdfs/sections/61-Hand_Tools_part1.pdf' },
  '61-Hand_Tools_part2':                           { start: 809,  end: 861,  filePath: '/pdfs/sections/61-Hand_Tools_part2.pdf' },
  '63-Cutting_Tools':                              { start: 862,  end: 890,  filePath: '/pdfs/sections/63-Cutting_Tools.pdf' },
  '65-Measuring_Tools':                            { start: 891,  end: 946,  filePath: '/pdfs/sections/65-Measuring_Tools.pdf' },
  '67-Metal_Sheets_Bars':                          { start: 947,  end: 967,  filePath: '/pdfs/sections/67-Metal_Sheets_Bars.pdf' },
  '69-Screws_Nuts':                                { start: 968,  end: 995,  filePath: '/pdfs/sections/69-Screws_Nuts.pdf' },
  '71-Pipes_Tubes':                                { start: 996,  end: 1008, filePath: '/pdfs/sections/71-Pipes_Tubes.pdf' },
  '73-Pipe_Tube_Fittings':                         { start: 1009, end: 1045, filePath: '/pdfs/sections/73-Pipe_Tube_Fittings.pdf' },
  '75-Valves_Cocks_part1':                         { start: 1046, end: 1103, filePath: '/pdfs/sections/75-Valves_Cocks_part1.pdf' },
  '75-Valves_Cocks_part2':                         { start: 1104, end: 1162, filePath: '/pdfs/sections/75-Valves_Cocks_part2.pdf' },
  '77-Bearings':                                   { start: 1163, end: 1175, filePath: '/pdfs/sections/77-Bearings.pdf' },
  '79-Electrical_Equipment_part1':                 { start: 1176, end: 1217, filePath: '/pdfs/sections/79-Electrical_Equipment_part1.pdf' },
  '79-Electrical_Equipment_part2':                 { start: 1218, end: 1260, filePath: '/pdfs/sections/79-Electrical_Equipment_part2.pdf' },
  '81-Packing_Jointing':                           { start: 1261, end: 1329, filePath: '/pdfs/sections/81-Packing_Jointing.pdf' },
  '85-Welding_Equipment':                          { start: 1330, end: 1355, filePath: '/pdfs/sections/85-Welding_Equipment.pdf' },
  '87-Machinery_Equipment':                        { start: 1356, end: 1367, filePath: '/pdfs/sections/87-Machinery_Equipment.pdf' },
  '11-Welware_Items':                              { start: 1368, end: 1380, filePath: '/pdfs/sections/11-Welware_Items.pdf' },
  '00_10-Provisions_Slop_Chest':                   { start: 1381, end: 1406, filePath: '/pdfs/sections/00_10-Provisions_Slop_Chest.pdf' },
};

async function extractFromSection(sectionName, pageInfo) {
  const pdfPath = join(ROOT, 'public', pageInfo.filePath);
  
  // 使用 pdfjs-dist（已在 dependencies 中）
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() =>
    import('pdfjs-dist')
  );
  
  // Node.js 环境下禁用 worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  
  const { readFileSync } = await import('fs');
  const data = new Uint8Array(readFileSync(pdfPath));
  const pdf = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
  
  const entries = [];
  // IMPA 编码正则：6位数字（前2位通常为章节号），独立出现
  const IMPA_CODE_RE = /\b(\d{6})\b/g;
  // 过滤明显非IMPA的数字（纯年份、尺寸等）
  const EXCLUDE_RE = /^(19|20)\d{2}$|^\d{2,4}[xX]\d{2,4}$/;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // 将文本项按 Y 坐标分组（同一行）
    const lineMap = new Map();
    for (const item of textContent.items) {
      if (!item.str || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]); // Y 坐标
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push({ x: item.transform[4], str: item.str.trim() });
    }
    
    // 按 Y 降序（PDF 坐标系从下往上）排列行
    const sortedLines = Array.from(lineMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.sort((a, b) => a.x - b.x).map(i => i.str).join(' '));
    
    const absolutePage = pageInfo.start + pageNum - 1;
    
    for (const line of sortedLines) {
      let match;
      IMPA_CODE_RE.lastIndex = 0;
      while ((match = IMPA_CODE_RE.exec(line)) !== null) {
        const code = match[1];
        if (EXCLUDE_RE.test(code)) continue;
        
        // 提取编码后面的描述文字（同行剩余内容）
        const afterCode = line.slice(match.index + code.length).trim();
        // 只保留可读文字（过滤明显乱码：含大量非ASCII字符的行）
        const readableDesc = isReadable(afterCode) ? afterCode.slice(0, 120) : '';
        
        // 避免同一页同一编码重复
        const key = `${code}-${absolutePage}`;
        if (!entries.find(e => e._key === key)) {
          entries.push({
            _key: key,
            code,
            name: readableDesc,
            page: absolutePage,           // 绝对页码
            relativePage: pageNum,        // 相对页码（PDF.js 使用）
            sectionName,
            filePath: pageInfo.filePath,
          });
        }
      }
    }
  }
  
  return entries;
}

// 判断字符串是否可读（非乱码）
function isReadable(str) {
  if (!str || str.length < 2) return false;
  const printable = str.replace(/[^\x20-\x7E]/g, '');
  return printable.length / str.length > 0.7; // 70% 以上为可打印 ASCII
}

async function main() {
  console.log('🔍 Generating IMPA search index...');
  const allEntries = [];
  const sectionNames = Object.keys(SECTION_PAGES);
  
  for (let i = 0; i < sectionNames.length; i++) {
    const name = sectionNames[i];
    const info = SECTION_PAGES[name];
    process.stdout.write(`  [${i + 1}/${sectionNames.length}] ${name}...`);
    
    try {
      const entries = await extractFromSection(name, info);
      allEntries.push(...entries);
      console.log(` ✓ ${entries.length} codes found`);
    } catch (err) {
      console.log(` ✗ Error: ${err.message}`);
    }
  }
  
  // 去除内部 key，排序
  const cleanEntries = allEntries
    .map(({ _key, ...e }) => e)
    .sort((a, b) => a.page - b.page);
  
  const index = {
    version: '1.0',
    generated: new Date().toISOString().split('T')[0],
    totalEntries: cleanEntries.length,
    entries: cleanEntries,
  };
  
  const outputPath = join(ROOT, 'public/search-index.json');
  writeFileSync(outputPath, JSON.stringify(index));
  const sizeMB = (JSON.stringify(index).length / 1024 / 1024).toFixed(2);
  console.log(`\n✅ Done! ${cleanEntries.length} entries → public/search-index.json (${sizeMB} MB)`);
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
```

### 1.2 在 package.json 中添加构建命令

在 `package.json` 的 `scripts` 中添加：

```json
"build:index": "node scripts/generate-search-index.mjs",
"prebuild": "node scripts/generate-search-index.mjs"
```

> `prebuild` 钩子确保每次 `npm run build` 前自动重新生成索引。

### 1.3 先手动运行验证

```bash
node scripts/generate-search-index.mjs
```

验证输出：
- `public/search-index.json` 文件存在
- 文件大小 < 5MB
- `totalEntries` > 1000
- 抽查几个 entry：`code` 为6位数字，`page` 在 39-1406 范围内

---

## TASK 2：新建 SearchIndex 数据层

**目的**：创建 `src/lib/searchIndex.ts`，替代 `PDFTextContext` 的 400MB PDF 加载逻辑。

创建文件 `src/lib/searchIndex.ts`：

```typescript
/**
 * 预构建搜索索引的客户端加载和查询模块
 * 替代原来的 PDFTextContext 中的 PDF 下载+文本提取流程
 */

export interface IndexEntry {
  code: string;         // 6位 IMPA 编码
  name: string;         // 产品描述（可能为空）
  page: number;         // 绝对页码
  relativePage: number; // 相对页码（PDF.js 使用）
  sectionName: string;  // 章节名
  filePath: string;     // PDF 文件路径
}

export interface SearchIndex {
  version: string;
  generated: string;
  totalEntries: number;
  entries: IndexEntry[];
}

export interface SearchResult {
  code: string;
  name: string;
  page: number;
  relativePage: number;
  sectionName: string;
  filePath: string;
  matchType: 'code' | 'name';
  score: number;
}

const INDEX_URL = '/search-index.json';
const CACHE_KEY = 'impa_search_index_v1';
const CACHE_VERSION = '1.0';

let _index: SearchIndex | null = null;

/**
 * 加载搜索索引（带 localStorage 缓存）
 */
export async function loadSearchIndex(
  onProgress?: (loaded: boolean) => void
): Promise<SearchIndex> {
  if (_index) return _index;

  // 检查 localStorage 缓存（索引不常变化，可缓存较久）
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { version, data } = JSON.parse(cached);
        if (version === CACHE_VERSION) {
          _index = data;
          onProgress?.(true);
          return _index!;
        }
      }
    } catch {
      // 缓存损坏，重新下载
    }
  }

  const resp = await fetch(INDEX_URL);
  if (!resp.ok) throw new Error(`Failed to load search index: ${resp.status}`);
  
  const data: SearchIndex = await resp.json();
  _index = data;
  
  // 存入缓存
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, data }));
    } catch {
      // 存储失败不影响功能
    }
  }
  
  onProgress?.(true);
  return data;
}

/**
 * 判断查询是否为 IMPA 编码模式（纯数字 5-7 位）
 */
export function isCodeQuery(query: string): boolean {
  return /^\d{5,7}$/.test(query.trim());
}

/**
 * 搜索函数
 * - 纯数字查询 → 精确/前缀匹配 IMPA 编码
 * - 文字查询 → 匹配产品描述（大小写不敏感，支持多词）
 */
export function searchIndex(
  index: SearchIndex,
  query: string,
  maxResults = 100
): SearchResult[] {
  const q = query.trim();
  if (!q || !index?.entries) return [];

  const results: SearchResult[] = [];

  if (isCodeQuery(q)) {
    // 编码模式：精确匹配 > 前缀匹配
    for (const entry of index.entries) {
      if (entry.code === q) {
        results.push({ ...entry, matchType: 'code', score: 100 });
      } else if (entry.code.startsWith(q)) {
        results.push({ ...entry, matchType: 'code', score: 80 });
      }
      if (results.length >= maxResults) break;
    }
  } else {
    // 名称模式：多词匹配（所有词必须出现）
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    for (const entry of index.entries) {
      const haystack = (entry.code + ' ' + entry.name + ' ' + entry.sectionName).toLowerCase();
      const allMatch = terms.every(t => haystack.includes(t));
      if (allMatch) {
        // 计算相关度：完全匹配得分更高
        const score = entry.name.toLowerCase().startsWith(q.toLowerCase()) ? 90 :
                      entry.name.toLowerCase().includes(q.toLowerCase()) ? 70 : 50;
        results.push({ ...entry, matchType: 'name', score });
      }
      if (results.length >= maxResults) break;
    }
  }

  // 按得分降序，同分按页码升序
  return results.sort((a, b) => b.score - a.score || a.page - b.page);
}

/**
 * 清除索引缓存（强制重新下载）
 */
export function clearIndexCache(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }
  _index = null;
}
```

---

## TASK 3：新建 SearchIndexContext，替代 PDFTextContext 的搜索用途

**目的**：创建轻量的 `src/contexts/SearchIndexContext.tsx`。  
注意：**不删除 PDFTextContext**，它仍负责在 PDF 查看器中提取单个章节文本用于本地高亮。只是搜索功能切换到预构建索引。

创建 `src/contexts/SearchIndexContext.tsx`：

```tsx
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loadSearchIndex, SearchIndex } from '@/lib/searchIndex';

interface SearchIndexContextType {
  index: SearchIndex | null;
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

const SearchIndexContext = createContext<SearchIndexContextType>({
  index: null,
  isLoading: false,
  isReady: false,
  error: null,
});

export function SearchIndexProvider({ children }: { children: ReactNode }) {
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setIsLoading(true);
    loadSearchIndex()
      .then(idx => {
        setIndex(idx);
        setIsLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [mounted]);

  if (!mounted) {
    return (
      <SearchIndexContext.Provider value={{ index: null, isLoading: false, isReady: false, error: null }}>
        {children}
      </SearchIndexContext.Provider>
    );
  }

  return (
    <SearchIndexContext.Provider value={{ index, isLoading, isReady: !!index && !isLoading, error }}>
      {children}
    </SearchIndexContext.Provider>
  );
}

export function useSearchIndex() {
  return useContext(SearchIndexContext);
}
```

然后在 `src/app/layout.tsx` 的 Provider 包裹顺序中加入 `SearchIndexProvider`：

```tsx
// 在 PDFTextProvider 外层或平行位置加入
<ThemeProvider>
  <SearchIndexProvider>      {/* ← 新增 */}
    <PDFTextProvider>
      <DevToolsInit />
      {children}
    </PDFTextProvider>
  </SearchIndexProvider>
</ThemeProvider>
```

---

## TASK 4：改造 SmartSearchBox 实现即时搜索

**目的**：用 `searchIndex()` 替代原有的 regex 搜索；加入 300ms 防抖实现即时匹配；识别 IMPA 编码模式。

修改 `src/components/SmartSearchBox.tsx`：

**修改要点（不是完整重写，只改以下部分）：**

```typescript
// 1. 在文件顶部加入新 import
import { useSearchIndex } from '@/contexts/SearchIndexContext';
import { searchIndex, isCodeQuery } from '@/lib/searchIndex';

// 2. 在组件内获取索引
const { index, isReady: indexReady } = useSearchIndex();

// 3. 将 searchInAllSections 替换为：
const searchInAllSections = useCallback(async (query: string): Promise<SmartSearchResult[]> => {
  if (!index || !query.trim()) return [];
  
  const results = searchIndex(index, query, 100);
  
  // 转换为现有的 SmartSearchResult 格式（保持下游组件兼容）
  return results.map((r, i) => ({
    page: r.page,
    relativePage: r.relativePage,
    text: r.code + (r.name ? `  ${r.name}` : ''),
    index: i,
    context: `IMPA: ${r.code}\n${r.name || ''}`,
    sectionName: r.sectionName,
    sectionPath: r.filePath,
    category: r.matchType,
  }));
}, [index]);

// 4. 加入即时搜索（防抖 300ms）
// 在 searchTerm 的 onChange 处理中，替换原来「清空时清除结果」逻辑：
useEffect(() => {
  if (!searchTerm.trim()) {
    onSearchResults([]);
    onSearchResultsUpdate?.([]);
    return;
  }
  const timer = setTimeout(() => {
    if (indexReady) {
      handleSearch();
    }
  }, 300);
  return () => clearTimeout(timer);
}, [searchTerm, indexReady]); // eslint-disable-line react-hooks/exhaustive-deps

// 5. 在 input placeholder 根据搜索模式动态变化：
const isCode = isCodeQuery(searchTerm);
const placeholder = isCode
  ? `Searching IMPA code "${searchTerm}"...`
  : 'Search IMPA code (e.g. 310311) or product name...';
```

**输入框新增视觉反馈**：当输入为纯数字时，在搜索框左侧显示 `#` 徽标：

```tsx
{/* 在 input 左侧加入编码模式标识 */}
{isCodeQuery(searchTerm) && (
  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
    CODE
  </span>
)}
```

---

## TASK 5：搜索结果展示优化（双向查询 UI）

**目的**：在 `SearchResultsOnly.tsx` 中突出显示 IMPA 编码，并添加一键复制按钮。

修改 `src/components/SearchResultsOnly.tsx` 的结果卡片渲染部分：

```tsx
// 在每个搜索结果卡片中，将编码单独渲染：
// 找到渲染单条结果的 JSX，替换为：

<div className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
  onClick={() => handleResultClick(result, groupIndex)}>
  
  {/* IMPA 编码徽章 */}
  <div className="flex-shrink-0 flex flex-col items-center gap-1">
    <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20 tracking-wider">
      {result.text.split('  ')[0]}
    </span>
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(result.text.split('  ')[0]);
        // TODO: 短暂显示 "Copied!" tooltip
      }}
      className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
      title="Copy IMPA code"
    >
      copy
    </button>
  </div>
  
  {/* 产品描述和页码 */}
  <div className="flex-1 min-w-0">
    <p className="text-xs font-medium text-foreground truncate">
      {result.text.split('  ').slice(1).join('  ') || '—'}
    </p>
    <p className="text-[10px] text-muted-foreground mt-0.5">
      p.{result.page} · {result.sectionName.split('-').slice(1).join(' ')}
    </p>
  </div>
</div>
```

---

## TASK 6：首页 LoadingScreen 优化

**目的**：新架构下首页加载只需下载 `search-index.json`（约 1-2MB），不再需要全屏加载界面。

修改 `src/app/page.tsx`：

```tsx
// 原来：
// if (!mounted || (loadingStatus.isLoading && !isReady)) {
//   return <LoadingScreen />;
// }

// 改为：使用 SearchIndexContext 的 isLoading 来判断
import { useSearchIndex } from '@/contexts/SearchIndexContext';

const { isLoading: indexLoading, isReady: indexReady } = useSearchIndex();

// 加载状态改为简单的内联提示，不再全屏 Loading
// 在搜索框下方显示：
{indexLoading && (
  <p className="text-xs text-muted-foreground text-center mt-2 animate-pulse">
    Loading search index...
  </p>
)}
```

---

## TASK 7：PDFTextContext 瘦身

**目的**：现在 PDFTextContext 只在 PDF 查看器查看时加载**当前章节**，不再全量加载所有章节。

修改 `src/contexts/PDFTextContext.tsx`：

将 `startLoading()` 改为 `loadSection(filePath: string)`：

```typescript
// 删除：遍历所有章节的循环
// 新增：按需加载单个章节
const loadSection = useCallback(async (filePath: string) => {
  if (textData[filePath]) return; // 已缓存
  
  // ... 仅加载该文件路径的 PDF，提取文本
  // 用于 PDF 查看器内的文本高亮功能
}, [textData]);
```

> **注意**：`startLoading()` 接口暂时保留（空实现），避免破坏现有调用方。逐步迁移后再删除。

---

## TASK 8：AGENTS.md 同步更新

Task 1-7 完成后，在 AGENTS.md 的「核心架构概念」中更新「3. PDF 文本加载流程」章节，反映新的预构建索引架构。

---

## 验证清单（每个 Task 完成后由 Claude 执行）

### Task 1 验证
- [ ] `public/search-index.json` 存在且 JSON 有效
- [ ] 文件大小 ≤ 5MB
- [ ] `totalEntries` ≥ 500
- [ ] 随机抽取 10 个 entry：`code` 为 6 位数字且 `page` 在有效范围
- [ ] `npm run build:index` 运行无报错

### Task 2 验证
- [ ] `src/lib/searchIndex.ts` TypeScript 编译无错误
- [ ] `loadSearchIndex()` 能正确解析 JSON
- [ ] `searchIndex(index, '310311')` 返回编码匹配结果
- [ ] `searchIndex(index, 'safety')` 返回名称匹配结果
- [ ] `isCodeQuery('310311')` → `true`；`isCodeQuery('safety valve')` → `false`

### Task 3 验证
- [ ] `SearchIndexProvider` 在 layout.tsx 中正确嵌套
- [ ] `useSearchIndex()` 在搜索页中返回 `isReady: true`
- [ ] 加载时 `isLoading: true`，加载后 `isReady: true`

### Task 4 验证
- [ ] 输入 `310311` 后 300ms 内自动触发搜索，无需按 Enter
- [ ] 输入 `safety` 后 300ms 内自动触发搜索
- [ ] 清空输入框时结果清除
- [ ] 显示 CODE 模式标识
- [ ] `npm run build` 无 TypeScript 错误

### Task 5 验证
- [ ] 搜索结果中 IMPA 编码以等宽字体单独显示
- [ ] 点击 copy 按钮后编码复制到剪贴板
- [ ] 页码和章节名正确显示

### Task 6 验证
- [ ] 首页不再显示全屏 LoadingScreen（或显示时间 < 2秒）
- [ ] 搜索框在索引加载完成前有合适的 disabled 状态提示

### Task 7 验证（可选 / 后续迭代）
- [ ] 进入搜索页后，只加载当前章节 PDF 的文本
- [ ] 切换章节时，新章节文本正确加载
- [ ] 已缓存章节不重复加载

---

## 优先级总览

| Task | 影响 | 难度 | 顺序 |
|------|------|------|------|
| Task 1: 预构建索引脚本 | 🔴 最高 | 中 | 1 |
| Task 2: searchIndex.ts | 🔴 最高 | 低 | 2 |
| Task 3: SearchIndexContext | 🔴 最高 | 低 | 3 |
| Task 4: 即时搜索 | 🟠 高 | 中 | 4 |
| Task 5: 结果展示优化 | 🟠 高 | 低 | 5 |
| Task 6: 首页加载优化 | 🟡 中 | 低 | 6 |
| Task 7: PDFTextContext 瘦身 | 🟡 中 | 中 | 7（可分批） |
| Task 8: AGENTS.md 更新 | ⚪ 低 | 极低 | 8 |

---

## 其他中长期优化建议（本轮 Codex 不执行，供参考）

### 搜索质量提升
- **模糊匹配**：引入 [MiniSearch](https://github.com/lucaong/minisearch)（2KB gzip），支持拼写容错
- **同义词词典**：`anchor = hawser = mooring` 等海事术语映射
- **中文支持**：允许用中文描述搜索（`螺母` → `Screws & Nuts`）

### 双向查询强化
- **编码段位高亮**：搜索 `31` 时高亮所有安全设备类 `31xxxx` 编码
- **相邻编码推断**：从某个编码跳转到同产品系列的相邻编码
- **历史记录**：localStorage 保存最近 20 次查询

### 性能
- **Service Worker 预缓存**：在 PWA 安装时预下载 `search-index.json`
- **分片索引**：按章节分片，用户只下载需要的章节索引
- **Vercel Edge Config**：存储索引版本号，客户端检查版本再决定是否更新
