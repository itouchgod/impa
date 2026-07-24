/**
 * 预构建搜索索引的客户端加载和查询模块。
 * 索引由 OCR Markdown 构建（scripts/generate-search-index.mjs）。
 */

export interface IndexEntry {
  code: string;
  name: string;
  page: number;
  relativePage: number;
  sectionName: string;
  filePath: string;
}

export interface SearchIndex {
  version: string;
  generated: string;
  totalEntries: number;
  entries: IndexEntry[];
  source?: string;
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
const CACHE_VERSION = '1.13';

let cachedIndex: SearchIndex | null = null;

export async function loadSearchIndex(
  onProgress?: (loaded: boolean) => void
): Promise<SearchIndex> {
  if (cachedIndex) {
    onProgress?.(true);
    return cachedIndex;
  }

  const localIndex = readCachedIndex();
  if (localIndex) {
    cachedIndex = localIndex;
    onProgress?.(true);
    return cachedIndex;
  }

  const response = await fetch(INDEX_URL);
  if (!response.ok) {
    throw new Error(`Failed to load search index: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  if (!isSearchIndex(data)) {
    throw new Error('Invalid search index format');
  }

  cachedIndex = data;
  writeCachedIndex(data);
  onProgress?.(true);

  return data;
}

/** Normalize IMPA code queries like "31 01 01" / "31-01-01" → digits only. */
export function normalizeCodeQuery(query: string): string {
  return query.trim().replace(/[\s\-_./]/g, '');
}

export function isCodeQuery(query: string): boolean {
  // 4 digits = chapter/group prefix (e.g. 3101); 5–7 = partial/full IMPA codes
  return /^\d{4,7}$/.test(normalizeCodeQuery(query));
}

export function searchIndex(
  index: SearchIndex,
  query: string,
  maxResults = 100
): SearchResult[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery || !index?.entries?.length || maxResults <= 0) {
    return [];
  }

  const results: SearchResult[] = [];
  const codeQuery = normalizeCodeQuery(normalizedQuery);

  // "17" / "17 20" 输入中：纯数字但不足 4 位时不搜，避免把章节号当关键词扫出上千条
  if (/^\d+$/.test(codeQuery) && codeQuery.length < 4) {
    return [];
  }

  // 超长纯数字也不是合法 IMPA 编码
  if (/^\d+$/.test(codeQuery) && codeQuery.length > 7) {
    return [];
  }

  if (/^\d{4,7}$/.test(codeQuery)) {
    for (const entry of index.entries) {
      if (entry.code === codeQuery) {
        results.push({ ...entry, matchType: 'code', score: 100 });
      } else if (entry.code.startsWith(codeQuery)) {
        // Longer remaining suffix → weaker prefix match
        const score = Math.max(60, 90 - (entry.code.length - codeQuery.length) * 5);
        results.push({ ...entry, matchType: 'code', score });
      }
    }
  } else {
    const loweredQuery = normalizedQuery.toLowerCase();
    const terms = loweredQuery.split(/\s+/).filter(Boolean);

    for (const entry of index.entries) {
      const loweredName = entry.name.toLowerCase();
      const codeAndName = `${entry.code} ${loweredName}`;
      const sectionLower = entry.sectionName.toLowerCase();
      const haystack = `${codeAndName} ${sectionLower}`;

      if (!terms.every((term) => haystack.includes(term))) {
        continue;
      }

      const matchedInCodeOrName = terms.every((term) => codeAndName.includes(term));
      // 仅靠章节名命中（如 tools/equipment）降权，避免首页常用词假相关
      if (!matchedInCodeOrName) {
        results.push({ ...entry, matchType: 'name', score: 25 });
        continue;
      }

      let score = 50;
      if (loweredName === loweredQuery) {
        score = 95;
      } else if (loweredName.startsWith(loweredQuery)) {
        score = 90;
      } else if (loweredName.includes(loweredQuery)) {
        score = 70;
      } else if (terms.every((term) => loweredName.includes(term))) {
        score = 65;
      }

      results.push({ ...entry, matchType: 'name', score });
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.page - b.page || a.code.localeCompare(b.code))
    .slice(0, maxResults);
}

export function clearIndexCache(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }

  cachedIndex = null;
}

function readCachedIndex(): SearchIndex | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return null;
    }

    const payload = JSON.parse(cached) as unknown;
    if (!isCachedPayload(payload)) {
      return null;
    }

    return payload.data;
  } catch {
    return null;
  }
}

function writeCachedIndex(index: SearchIndex): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, data: index }));
  } catch {
    // localStorage 可能满额或不可用；索引仍保留在内存缓存中。
  }
}

function isCachedPayload(value: unknown): value is { version: string; data: SearchIndex } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as { version?: unknown; data?: unknown };
  return payload.version === CACHE_VERSION && isSearchIndex(payload.data);
}

function isSearchIndex(value: unknown): value is SearchIndex {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const index = value as Partial<SearchIndex>;
  return (
    typeof index.version === 'string' &&
    typeof index.generated === 'string' &&
    typeof index.totalEntries === 'number' &&
    Array.isArray(index.entries) &&
    index.entries.every(isIndexEntry)
  );
}

function isIndexEntry(value: unknown): value is IndexEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const entry = value as Partial<IndexEntry>;
  return (
    typeof entry.code === 'string' &&
    typeof entry.name === 'string' &&
    typeof entry.page === 'number' &&
    typeof entry.relativePage === 'number' &&
    typeof entry.sectionName === 'string' &&
    typeof entry.filePath === 'string'
  );
}
