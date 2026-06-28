/**
 * 预构建搜索索引的客户端加载和查询模块。
 * 替代原来的 PDFTextContext 中的 PDF 下载和全文提取搜索流程。
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

export function isCodeQuery(query: string): boolean {
  return /^\d{5,7}$/.test(query.trim());
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

  if (isCodeQuery(normalizedQuery)) {
    for (const entry of index.entries) {
      if (entry.code === normalizedQuery) {
        results.push({ ...entry, matchType: 'code', score: 100 });
      } else if (entry.code.startsWith(normalizedQuery)) {
        results.push({ ...entry, matchType: 'code', score: 80 });
      }

      if (results.length >= maxResults) {
        break;
      }
    }
  } else {
    const loweredQuery = normalizedQuery.toLowerCase();
    const terms = loweredQuery.split(/\s+/).filter(Boolean);

    for (const entry of index.entries) {
      const loweredName = entry.name.toLowerCase();
      const haystack = `${entry.code} ${loweredName} ${entry.sectionName.toLowerCase()}`;

      if (terms.every((term) => haystack.includes(term))) {
        const score = loweredName.startsWith(loweredQuery)
          ? 90
          : loweredName.includes(loweredQuery)
            ? 70
            : 50;

        results.push({ ...entry, matchType: 'name', score });
      }

      if (results.length >= maxResults) {
        break;
      }
    }
  }

  return results.sort((a, b) => b.score - a.score || a.page - b.page);
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
