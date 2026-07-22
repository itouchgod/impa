'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PDFViewer, { PDFViewerRef } from '@/components/PDFViewer';
import SmartSearchBox from '@/components/SmartSearchBox';
import SearchResultsOnly from '@/components/SearchResultsOnly';
import DraggableFloatingButton from '@/components/DraggableFloatingButton';
import PDFSelector from '@/components/PDFSelector';
import { PDF_CONFIG } from '@/config/pdf';
import Link from 'next/link';
import Image from 'next/image';
import { PageCalculator } from '@/utils/pageCalculator';
import { SectionChangeHandler } from '@/types/pdf';
import { getGlassButtonBaseStyles, createGlassButtonHandlers, getIconStyles, getPageNumberStyles } from '@/lib/buttonStyles';

function SearchContent() {
  const searchParams = useSearchParams();
  const [selectedPDF, setSelectedPDF] = useState<string>(PDF_CONFIG.sections[0].filePath);
  const pdfViewerRef = useRef<PDFViewerRef>(null);
  
  // 用于在header和sidebar之间共享搜索结果
  const [sharedSearchResults, setSharedSearchResults] = useState<any[]>([]);
  const [sharedSearchTerm, setSharedSearchTerm] = useState('');
  const [hasSearchResults, setHasSearchResults] = useState(false);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [targetPage, setTargetPage] = useState<number | undefined>(undefined);
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(() => {
    const calculator = PageCalculator.fromPath(selectedPDF);
    return calculator ? calculator.getTotalPages() : 1;
  });


  const handleClearSearch = useCallback(() => {
    setSharedSearchResults([]);
    setSharedSearchTerm('');
    setIsSearchActive(false);
    setHasSearchResults(false);
    setCurrentResultIndex(0);
  }, []);

  const handleSearchResults = useCallback(() => {}, []);

  // 通用的分组函数
  const getGroupedResults = useCallback(() => {
    const groups = new Map();
    sharedSearchResults.forEach(result => {
      const key = `${result.sectionPath}-${result.page}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(result);
    });
    
    // 将分组结果转换为数组；优先相关度，其次页码
    const groupedArray = Array.from(groups.entries()).map(([key, groupResults]) => ({
      key,
      page: groupResults[0].page,
      sectionPath: groupResults[0].sectionPath,
      sectionName: groupResults[0].sectionName,
      results: groupResults,
      count: groupResults.length,
      score: Math.max(...groupResults.map((result: { score?: number }) => result.score ?? 0)),
    }));

    return groupedArray.sort(
      (a, b) => b.score - a.score || a.page - b.page
    );
  }, [sharedSearchResults]);

  const getGroupedResultsCount = useCallback(() => {
    return getGroupedResults().length;
  }, [getGroupedResults]);

  // 导航到上一个搜索结果
  const goToPreviousResult = () => {
    if (currentResultIndex > 0) {
      const newIndex = currentResultIndex - 1;
      setCurrentResultIndex(newIndex);
      jumpToResult(newIndex);
    }
  };

  // 导航到下一个搜索结果
  const goToNextResult = () => {
    const groupedCount = getGroupedResultsCount();
    if (currentResultIndex < groupedCount - 1) {
      const newIndex = currentResultIndex + 1;
      setCurrentResultIndex(newIndex);
      jumpToResult(newIndex);
    }
  };

  // 统一的PDF导航函数
  const navigateToPDF = useCallback(async (pdfPath: string, pageNumber?: number) => {
    const calculator = PageCalculator.fromPath(pdfPath);
    if (!calculator) {
      console.error('Section not found:', pdfPath);
      return;
    }

    // 如果没有提供页码，使用当前页码
    const validPage = typeof pageNumber === 'number'
      ? calculator.getValidRelativePage(pageNumber)
      : calculator.getValidRelativePage(currentPage);

    // 批量更新所有状态
    if (pdfPath !== selectedPDF) {
      setSelectedPDF(pdfPath);
      setTotalPages(calculator.getTotalPages());
    }

    // 更新页码状态并跳转
    setTargetPage(validPage);
    setCurrentPage(validPage);
    pdfViewerRef.current?.jumpToPage(validPage);
  }, [selectedPDF, pdfViewerRef, currentPage]);

  // 跳转到指定结果
  const jumpToResult = useCallback(async (index: number) => {
    const groupedResults = getGroupedResults();
    
    if (index < 0 || index >= groupedResults.length) return;
    
    const result = groupedResults[index];
    if (!result || !result.sectionPath) return;

    const calculator = PageCalculator.fromPath(result.sectionPath);
    if (!calculator) return;
    const relativePage = calculator.getRelativePageFromResult(result.results[0]);
    
    await navigateToPDF(result.sectionPath, relativePage);
  }, [getGroupedResults, navigateToPDF]);

  // 页面跳转
  const handlePageJump = useCallback((pageNumber: number) => {
    if (pdfViewerRef.current) {
      setCurrentPage(pageNumber);
      setTargetPage(pageNumber);
      pdfViewerRef.current.jumpToPage(pageNumber);
    }
  }, []);

    // 章节切换
  const handleSectionChange: SectionChangeHandler = useCallback((sectionPath: string, pageOrReset?: number | boolean) => {
    // 如果是布尔值，转换为页码
    const targetPage = typeof pageOrReset === 'boolean' ? (pageOrReset ? 1 : undefined) : pageOrReset;
    const calculator = PageCalculator.fromPath(sectionPath);
    if (!calculator) {
      console.error('Section not found:', sectionPath);
      return;
    }
    // 直接传递目标页码
    navigateToPDF(sectionPath, targetPage);
  }, [navigateToPDF]);

  // URL更新
  const handleUpdateURL = useCallback((params: { query?: string; section?: string; page?: number }) => {
    if (typeof window === 'undefined') return;
    
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    url.searchParams.delete('section');
    url.searchParams.delete('page');
    
    if (params.query) {
      url.searchParams.set('q', params.query);
    } else if (params.query === '') {
      // 如果搜索词为空字符串，删除参数而不是设置空值
      url.searchParams.delete('q');
    }
    if (params.section) url.searchParams.set('section', params.section);
    if (params.page) url.searchParams.set('page', params.page.toString());
    
    window.history.pushState({}, '', url.toString());
  }, []);

  // 页面变化
  const handlePageChange = useCallback((page: number, total: number) => {
    setCurrentPage(page);
    setTotalPages(total);
  }, []);

  const handleSearchResultsUpdate = useCallback((results: any[], searchTerm: string) => {
    if (!results || !Array.isArray(results)) return;

    // 如果搜索结果相同，不更新状态
    if (JSON.stringify(results) === JSON.stringify(sharedSearchResults)) {
      return;
    }

    // 检查是否为新的搜索（搜索词变化）
    const isNewSearch = searchTerm !== sharedSearchTerm;

    // 批量更新搜索状态
    setSharedSearchResults(results);
    setSharedSearchTerm(searchTerm);
    setHasSearchResults(results.length > 0);
    setIsSearchActive(true);
    
    // 只在新的搜索时重置索引
    if (isNewSearch) {
      setCurrentResultIndex(0);
    }
  }, [sharedSearchResults, sharedSearchTerm]);

  // 从URL参数获取搜索词
  const searchQuery = searchParams?.get('q') || '';

  // 跨章节键盘快捷键支持 - 基于绝对页码
  const handleCrossSectionKeyNavigation = useCallback((direction: 'previous' | 'next') => {
    // 获取当前绝对页码
    const calculator = PageCalculator.fromPath(selectedPDF);
    if (!calculator) return;
    
    const currentAbsolutePage = calculator.toAbsolutePage(currentPage);
    const targetAbsolutePage = direction === 'next' ? currentAbsolutePage + 1 : currentAbsolutePage - 1;

    // 检查目标页码是否在有效范围内（39-1406），实现循环翻页
    const firstSection = PDF_CONFIG.sections[0];
    const minPage = firstSection.startPage;
    
    // 找到真正的最大页码
    const maxPage = Math.max(...PDF_CONFIG.sections.map(section => section.endPage));

    let finalTargetPage = targetAbsolutePage;
    
    // 实现循环翻页
    if (targetAbsolutePage < minPage) {
      // 如果目标页码小于最小页码，跳转到最后一页
      finalTargetPage = maxPage;
    } else if (targetAbsolutePage > maxPage) {
      // 如果目标页码大于最大页码，跳转到第一页
      finalTargetPage = minPage;
    }

    // 查找目标页码所在的章节
    const targetPageInfo = PageCalculator.findPageInfo(finalTargetPage);
    
    if (targetPageInfo) {
      // 目标页码在某个章节中
      if (targetPageInfo.section.filePath !== selectedPDF) {
        // 需要切换章节
        handleSectionChange(targetPageInfo.section.filePath, targetPageInfo.relativePage);
      } else {
        // 在当前章节内翻页
        if (direction === 'next') {
          pdfViewerRef.current?.jumpToPage(currentPage + 1);
        } else {
          pdfViewerRef.current?.jumpToPage(currentPage - 1);
        }
      }
    } else {
      // 目标页码超出范围，不执行任何操作
      console.warn(`Target page ${finalTargetPage} is out of range`);
    }
  }, [selectedPDF, currentPage, handleSectionChange]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault();
        handleCrossSectionKeyNavigation('previous');
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault();
        handleCrossSectionKeyNavigation('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCrossSectionKeyNavigation]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-background border-b border-border">
        <div className="max-w-full mx-auto px-4 py-4">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link href="/" className="flex items-center hover:opacity-80 transition-opacity duration-200 flex-shrink-0">
              <div className="w-5 h-7 relative">
                <Image 
                  src="/brand-icon.svg" 
                  alt="IMPA Logo" 
                  fill
                  sizes="20px"
                  className="object-contain"
                  priority
                  unoptimized
                />
              </div>
            </Link>
            
            <div className="w-full max-w-2xl">
              <SmartSearchBox
                onSearchResults={handleSearchResults}
                onClearSearch={handleClearSearch}
                onPageJump={handlePageJump}
                onSectionChange={handleSectionChange}
                onUpdateURL={handleUpdateURL}
                selectedPDF={selectedPDF}
                showSearchInHeader={true}
                initialSearchTerm={searchQuery}
                onSearchResultsUpdate={handleSearchResultsUpdate}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 py-1 pb-6">
        <div className={`flex flex-col lg:flex-row gap-2 ${
          isSearchActive && sharedSearchResults.length > 0 ? 'lg:gap-2' : ''
        }`}>
          <div className="flex-1 min-w-0 order-1 lg:order-1 lg:flex-[3] xl:flex-[4]">
            <div className="px-6 py-3 border-b border-border bg-card">
              <div className="flex items-center justify-center">
                <PDFSelector
                  selectedPDF={selectedPDF}
                  onSelectPDF={(pdfPath) => {
                    const section = PDF_CONFIG.sections.find(s => s.filePath === pdfPath);
                    if (section) {
                      // 切换章节时总是从第一页开始
                      navigateToPDF(section.filePath, 1);
                    }
                  }}
                />
              </div>
            </div>
            
            {/* 手机端翻页按钮 - 移动到PDF选择器下方 */}
            <div className="sm:hidden bg-card border-b border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  onClick={() => handleCrossSectionKeyNavigation('previous')}
                  className="flex items-center space-x-2 px-4 py-2 bg-secondary hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors duration-200 text-secondary-foreground"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-sm font-medium">Prev</span>
                </button>
                
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">Page</span>
                  <span className="px-3 py-1 bg-primary text-primary-foreground text-sm font-bold rounded-lg">
                  {(() => {
                    const calculator = PageCalculator.fromPath(selectedPDF);
                    if (!calculator) return currentPage;
                    return calculator.toAbsolutePage(currentPage);
                  })()}
                  </span>
                </div>
                
                <button
                  onClick={() => handleCrossSectionKeyNavigation('next')}
                  className="flex items-center space-x-2 px-4 py-2 bg-secondary hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors duration-200 text-secondary-foreground"
                >
                  <span className="text-sm font-medium">Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
              
            <div className="relative bg-background" style={{ margin: 0, padding: 0 }}>
              {isSearchActive && sharedSearchTerm && !hasSearchResults ? (
                <div className="flex flex-col items-center justify-center h-96">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <p className="text-base text-muted-foreground font-medium mb-1">No results found</p>
                    <p className="text-sm text-muted-foreground/70">Try different keywords</p>
                  </div>
                </div>
              ) : (
                <>
                  <PDFViewer
                    ref={pdfViewerRef}
                    pdfUrl={selectedPDF}
                    initialPage={targetPage || 1}
                    onTextExtracted={() => {}}
                    onPageChange={handlePageChange}
                  />
                  
                  {/* 可拖动的悬浮按钮 - 桌面端显示 */}
                  <div className="hidden sm:block">
                    <DraggableFloatingButton
                      currentPage={currentPage}
                      selectedPDF={selectedPDF}
                      onPreviousPage={() => pdfViewerRef.current?.jumpToPage(currentPage - 1)}
                      onNextPage={() => pdfViewerRef.current?.jumpToPage(currentPage + 1)}
                      isPreviousDisabled={currentPage <= 1}
                      isNextDisabled={currentPage >= totalPages}
                      onSectionChange={handleSectionChange}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {(isSearchActive && sharedSearchResults.length > 0 && sharedSearchTerm) && (
            <div className="w-full lg:flex-[1] xl:flex-[1] lg:min-w-[320px] lg:max-w-[480px] lg:flex-shrink-0 overflow-hidden order-2 lg:order-2 transition-all duration-300 ease-in-out h-[360px] lg:h-[87vh]">
              <div className="h-full flex flex-col">
                <div className="lg:hidden px-4 py-3 bg-muted border-b border-border/30">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-card-foreground">
                      Search Results ({sharedSearchResults.length})
                    </h3>
                    <div className="flex items-center space-x-1.5">
                      {(() => {
                        const buttonConfig = getGlassButtonBaseStyles('sm');
                        const handlers = createGlassButtonHandlers();
                        const pageNumberConfig = getPageNumberStyles();
                        return (
                          <>
                            <button
                              onClick={goToPreviousResult}
                              disabled={currentResultIndex === 0 || getGroupedResultsCount() === 0}
                              className={buttonConfig.className}
                              style={buttonConfig.style}
                              onMouseEnter={handlers.onMouseEnter}
                              onMouseLeave={handlers.onMouseLeave}
                              title="Previous result"
                            >
                              <svg className={`${getIconStyles('sm')} group-hover:-translate-x-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                            
                            <span className={pageNumberConfig.className}>
                              {getGroupedResultsCount() > 0 ? `${currentResultIndex + 1} / ${getGroupedResultsCount()}` : '0 / 0'}
                            </span>
                            
                            <button
                              onClick={goToNextResult}
                              disabled={currentResultIndex >= getGroupedResultsCount() - 1 || getGroupedResultsCount() === 0}
                              className={buttonConfig.className}
                              style={buttonConfig.style}
                              onMouseEnter={handlers.onMouseEnter}
                              onMouseLeave={handlers.onMouseLeave}
                              title="Next result"
                            >
                              <svg className={`${getIconStyles('sm')} group-hover:translate-x-0.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-1 sm:p-2">
                  <SearchResultsOnly
                    onPageJump={handlePageJump}
                    onSectionChange={handleSectionChange}
                    selectedPDF={selectedPDF}
                    sharedSearchResults={sharedSearchResults}
                    sharedSearchTerm={sharedSearchTerm}
                    currentResultIndex={currentResultIndex}
                    onResultIndexChange={setCurrentResultIndex}
                    onPreviousResult={goToPreviousResult}
                    onNextResult={goToNextResult}
                    groupedResults={getGroupedResults()}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="block mt-auto py-4 border-t border-border">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-center items-center space-x-3 text-xs text-muted-foreground/80">
            <div className="w-4 h-4 relative">
              <Image 
                src="/brand-icon.svg" 
                alt="IMPA Logo" 
                fill
                sizes="16px"
                className="object-contain"
                unoptimized
              />
            </div>
            <span className="font-medium hidden sm:inline">Marine Stores Guide</span>
            <span className="text-muted-foreground/60">•</span>
            <span>8th Edition 2023</span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground/70">Internal Use Only</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
