'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search } from 'lucide-react';
import { PerformanceMonitor } from '@/lib/performance';
import { SectionChangeHandler } from '@/types/pdf';
import { useSearchIndex } from '@/contexts/SearchIndexContext';
import { searchIndex, isCodeQuery } from '@/lib/searchIndex';

interface SmartSearchResult {
  page: number;
  relativePage?: number;
  text: string;
  index: number;
  context: string;
  sectionName: string;
  sectionPath: string;
  category: string;
}

interface SmartSearchBoxProps {
  onSearchResults: (results: SmartSearchResult[]) => void;
  onClearSearch: () => void;
  onUpdateURL?: (params: Record<string, string>) => void;
  onLoadingStatusChange?: (status: { isLoading: boolean; progress: number }) => void;
  showSearchInHeader?: boolean;
  initialSearchTerm?: string;
  preloadedTextData?: Record<string, string>;
  onSearchResultsUpdate?: (
    results: SmartSearchResult[],
    searchTerm: string
  ) => void;
  onPageJump?: (pageNumber: number) => void;
  onSectionChange?: SectionChangeHandler;
  selectedPDF?: string;
}

export default function SmartSearchBox({
  onSearchResults,
  onClearSearch,
  onUpdateURL,
  onLoadingStatusChange,
  showSearchInHeader = false,
  initialSearchTerm = '',
  onSearchResultsUpdate
}: SmartSearchBoxProps) {
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [isSearching, setIsSearching] = useState(false);
  const previousSearchTermRef = useRef(initialSearchTerm);
  const { index, isReady: indexReady } = useSearchIndex();
  
  const performanceMonitor = PerformanceMonitor.getInstance();

  // 同步初始搜索词
  useEffect(() => {
    setSearchTerm(initialSearchTerm);
  }, [initialSearchTerm]);

  // 智能搜索实现
  const searchInAllSections = useCallback(async (query: string): Promise<SmartSearchResult[]> => {
    const startTime = performanceMonitor.startMeasure();

    try {
      if (!index || !query.trim()) {
        return [];
      }

      const results = searchIndex(index, query, 100).map((result, resultIndex) => ({
        page: result.page,
        relativePage: result.relativePage,
        text: result.code + (result.name ? `  ${result.name}` : ''),
        index: resultIndex,
        context: `IMPA: ${result.code}\n${result.name || ''}`.trim(),
        sectionName: result.sectionName,
        sectionPath: result.filePath,
        category: result.matchType,
      }));

      performanceMonitor.endMeasure('search', startTime, { 
        resultCount: results.length,
        cached: false
      });
      
      return results;
    } catch (error) {
      console.error('Search error:', error);
      performanceMonitor.endMeasure('search', startTime, { error: true });
      return [];
    }
  }, [index, performanceMonitor]);

  const clearSearch = useCallback(() => {
    onClearSearch();
    onSearchResults([]);
    onSearchResultsUpdate?.([], '');
    onUpdateURL?.({ query: '' });
  }, [onClearSearch, onSearchResults, onSearchResultsUpdate, onUpdateURL]);

  // 处理搜索
  const handleSearch = useCallback(async () => {
    setIsSearching(true);
    if (onLoadingStatusChange) {
      onLoadingStatusChange({ isLoading: true, progress: 0 });
    }

    try {
      if (!searchTerm.trim()) {
        clearSearch();
        return;
      }

      if (!indexReady) {
        return;
      }

      const results = await searchInAllSections(searchTerm);
      onSearchResults(results);
      
      if (onSearchResultsUpdate) {
        onSearchResultsUpdate(results, searchTerm);
      }
      
      if (onUpdateURL) {
        onUpdateURL({ query: searchTerm });
      }
    } finally {
      setIsSearching(false);
      if (onLoadingStatusChange) {
        onLoadingStatusChange({ isLoading: false, progress: 100 });
      }
    }
  }, [
    searchTerm,
    indexReady,
    clearSearch,
    onSearchResults,
    onSearchResultsUpdate,
    onUpdateURL,
    onLoadingStatusChange,
    searchInAllSections,
    setIsSearching
  ]);

  useEffect(() => {
    const trimmedSearchTerm = searchTerm.trim();

    if (!trimmedSearchTerm) {
      if (previousSearchTermRef.current.trim()) {
        clearSearch();
      }
      previousSearchTermRef.current = searchTerm;
      return;
    }

    previousSearchTermRef.current = searchTerm;

    if (!indexReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      void handleSearch();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [clearSearch, handleSearch, indexReady, searchTerm]);

  // 处理回车键搜索
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchTerm.trim() && !isSearching) {
      void handleSearch();
    }
  };

  const isCode = isCodeQuery(searchTerm);
  const placeholder = isCode
    ? `Searching IMPA code "${searchTerm}"...`
    : 'Search IMPA code (e.g. 310311) or product name...';

  return (
    <div className={`relative ${showSearchInHeader ? 'w-full' : 'max-w-2xl mx-auto'}`}>
      <div className="relative group">
        <input
          type="text"
          id="smart-search-input"
          name="smart-search"
          value={searchTerm}
          onChange={(e) => {
            const newValue = e.target.value;
            setSearchTerm(newValue);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pr-20 py-3 bg-card border border-border rounded-full focus:outline-none focus:shadow-lg focus:border-primary transition-all duration-200 hover:shadow-md text-card-foreground placeholder:text-muted-foreground ${
            isCode ? 'pl-20' : 'pl-4'
          }`}
        />

        {isCode && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
            CODE
          </span>
        )}
        
        {/* 右侧按钮区域 */}
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          {/* 清除按钮 */}
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                previousSearchTermRef.current = '';
                clearSearch();
              }}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors duration-200"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          
          {/* 分隔线 */}
          {searchTerm && <div className="h-6 w-px bg-border"></div>}
          
          {/* 搜索按钮 */}
          <button
            onClick={() => void handleSearch()}
            disabled={isSearching || !indexReady || !searchTerm.trim()}
            className="p-2 text-muted-foreground hover:text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            {isSearching ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-muted-foreground border-t-primary"></div>
            ) : (
              <Search className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
