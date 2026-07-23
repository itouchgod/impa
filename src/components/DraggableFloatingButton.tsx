'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { PageCalculator } from '@/utils/pageCalculator';
import { PDF_CONFIG } from '@/config/pdf';

interface DraggableFloatingButtonProps {
  currentPage: number;
  selectedPDF: string;
  onPreviousPage: () => void;
  onNextPage: () => void;
  isPreviousDisabled: boolean;
  isNextDisabled: boolean;
  onSectionChange?: (sectionPath: string, pageOrReset?: number | boolean) => void;
}

interface Position {
  x: number;
  y: number;
}

export default function DraggableFloatingButton({
  currentPage,
  selectedPDF,
  onPreviousPage,
  onNextPage,
  isPreviousDisabled,
  isNextDisabled,
  onSectionChange
}: DraggableFloatingButtonProps) {
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Position>({ x: 0, y: 0 });
  const [isInitialized, setIsInitialized] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const numberButtonRef = useRef<HTMLDivElement>(null);

  // 标记客户端已挂载
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 初始化位置 - 默认在右侧中央
  useEffect(() => {
    if (!isClient || isInitialized) return;
    
    const savedPosition = localStorage.getItem('floating-button-position');
    if (savedPosition) {
      try {
        const parsed = JSON.parse(savedPosition);
        // 验证保存的位置是否仍然有效
        if (parsed.x >= 0 && parsed.y >= 0 && 
            parsed.x <= window.innerWidth - 100 && 
            parsed.y <= window.innerHeight - 200) {
          setPosition(parsed);
        } else {
          // 如果保存的位置无效，使用默认位置
          setPosition({ x: window.innerWidth - 100, y: window.innerHeight / 2 });
        }
      } catch {
        // 如果解析失败，使用默认位置
        setPosition({ x: window.innerWidth - 100, y: window.innerHeight / 2 });
      }
    } else {
      // 默认位置：右侧中央
      setPosition({ x: window.innerWidth - 100, y: window.innerHeight / 2 });
    }
    setIsInitialized(true);
  }, [isClient, isInitialized]);

  // 保存位置到localStorage
  const savePosition = useCallback((pos: Position) => {
    if (isClient) {
      localStorage.setItem('floating-button-position', JSON.stringify(pos));
    }
  }, [isClient]);

  // 重置到默认位置
  const resetToDefaultPosition = useCallback(() => {
    if (isClient) {
      const defaultPos = { x: window.innerWidth - 100, y: window.innerHeight / 2 };
      setPosition(defaultPos);
      savePosition(defaultPos);
    }
  }, [savePosition, isClient]);

  // 边界检测和调整
  const constrainPosition = useCallback((pos: Position): Position => {
    if (!containerRef.current || !isClient) return pos;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const margin = 20; // 距离边缘的最小距离

    return {
      x: Math.max(margin, Math.min(window.innerWidth - rect.width - margin, pos.x)),
      y: Math.max(margin, Math.min(window.innerHeight - rect.height - margin, pos.y))
    };
  }, [isClient]);

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  }, [position]);

  // 处理鼠标移动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const newPosition = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };

    const constrainedPosition = constrainPosition(newPosition);
    setPosition(constrainedPosition);
  }, [isDragging, dragStart, constrainPosition]);

  // 处理鼠标释放
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      savePosition(position);
    }
  }, [isDragging, position, savePosition]);

  // 处理触摸开始
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    // 阻止页面滚动和默认触摸行为
    e.preventDefault();
    e.stopPropagation();
    
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y
    });
  }, [position]);

  // 处理触摸移动
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isDragging) return;

    // 阻止页面滚动
    e.preventDefault();

    const touch = e.touches[0];
    const newPosition = {
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    };

    const constrainedPosition = constrainPosition(newPosition);
    setPosition(constrainedPosition);
  }, [isDragging, dragStart, constrainPosition]);

  // 处理触摸结束
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (isDragging) {
      // 阻止触摸结束时的默认行为
      e.preventDefault();
      setIsDragging(false);
      savePosition(position);
    }
  }, [isDragging, position, savePosition]);

  // 添加全局事件监听器
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // 窗口大小变化时重新调整位置
  useEffect(() => {
    if (!isClient) return;
    
    const handleResize = () => {
      const constrainedPosition = constrainPosition(position);
      setPosition(constrainedPosition);
      savePosition(constrainedPosition);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, constrainPosition, savePosition, isClient]);

  // 跨章节翻页逻辑 - 基于绝对页码
  const handleCrossSectionNavigation = useCallback((direction: 'previous' | 'next') => {
    if (!onSectionChange) return;

    // 获取当前绝对页码
    const calculator = PageCalculator.fromPath(selectedPDF);
    if (!calculator) return;
    
    const currentAbsolutePage = calculator.toAbsolutePage(currentPage);
    const targetAbsolutePage = direction === 'next' ? currentAbsolutePage + 1 : currentAbsolutePage - 1;

    // 有效绝对页范围（不依赖 sections 数组顺序）
    const minPage = Math.min(...PDF_CONFIG.sections.map((s) => s.startPage));
    const maxPage = Math.max(...PDF_CONFIG.sections.map((s) => s.endPage));
    
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
        onSectionChange(targetPageInfo.section.filePath, targetPageInfo.relativePage);
      } else {
        // 在当前章节内翻页
        if (direction === 'next') {
          onNextPage();
        } else {
          onPreviousPage();
        }
      }
    } else {
      // 目标页码超出范围，不执行任何操作
      console.warn(`Target page ${finalTargetPage} is out of range`);
    }
  }, [selectedPDF, currentPage, onSectionChange, onNextPage, onPreviousPage]);

  // 计算绝对页码
  const absolutePage = (() => {
    const calculator = PageCalculator.fromPath(selectedPDF);
    if (!calculator) return currentPage;
    return calculator.toAbsolutePage(currentPage);
  })();

  // 提取公共样式函数
  const getButtonBaseStyles = () => ({
    background: 'rgba(248, 250, 252, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(51, 65, 85, 0.2)',
    boxShadow: '0 8px 32px rgba(51, 65, 85, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
  });

  const getButtonHoverStyles = () => ({
    background: 'rgba(30, 58, 138, 0.2)',
    border: '1px solid rgba(30, 58, 138, 0.5)',
    boxShadow: '0 12px 40px rgba(30, 58, 138, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(25px)',
    WebkitBackdropFilter: 'blur(25px)'
  });

  const getPageNumberBaseStyles = () => ({
    background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.95) 0%, rgba(30, 58, 138, 0.95) 100%)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    boxShadow: '0 8px 32px rgba(30, 58, 138, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
  });

  const getPageNumberHoverStyles = () => ({
    background: 'linear-gradient(135deg, rgba(30, 58, 138, 1) 0%, rgba(30, 58, 138, 1) 100%)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    boxShadow: '0 12px 40px rgba(30, 58, 138, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
    backdropFilter: 'blur(25px)',
    WebkitBackdropFilter: 'blur(25px)'
  });

  // 通用事件处理器
  const handleButtonMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    const styles = getButtonHoverStyles();
    Object.assign(e.currentTarget.style, styles);
  };

  const handleButtonMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    const styles = getButtonBaseStyles();
    Object.assign(e.currentTarget.style, styles);
  };

  const handlePageNumberMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const styles = getPageNumberHoverStyles();
    Object.assign(e.currentTarget.style, styles);
  };

  const handlePageNumberMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    const styles = getPageNumberBaseStyles();
    Object.assign(e.currentTarget.style, styles);
  };

  // 发光效果样式
  const glowEffectStyles = {
    background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.3) 0%, rgba(30, 58, 138, 0.3) 100%)',
    boxShadow: '0 0 20px rgba(30, 58, 138, 0.5), 0 0 40px rgba(30, 58, 138, 0.3)'
  };

  const pageNumberGlowEffectStyles = {
    background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.4) 0%, rgba(30, 58, 138, 0.4) 100%)',
    boxShadow: '0 0 25px rgba(30, 58, 138, 0.7), 0 0 50px rgba(30, 58, 138, 0.5)'
  };

  if (!isClient || !isInitialized) {
    return null; // 避免闪烁和水合错误
  }

  return (
    <div
      ref={containerRef}
      className="fixed z-50 animate-fade-in select-none"
      style={{
        left: position.x,
        top: position.y,
        transform: isDragging ? 'scale(1.05) rotate(2deg)' : 'scale(1) rotate(0deg)',
        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        filter: isDragging ? 'brightness(1.1)' : 'brightness(1)'
      }}
    >
      <div className="flex flex-col items-center space-y-2.5 sm:space-y-3 lg:space-y-3.5 animate-float">
        {/* 上一页按钮 */}
        <button
          onClick={() => handleCrossSectionNavigation('previous')}
          disabled={!onSectionChange && isPreviousDisabled}
          className="group relative w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center text-slate-600 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 ease-out hover:scale-105 active:scale-95 overflow-hidden"
          style={getButtonBaseStyles()}
          onMouseEnter={handleButtonMouseEnter}
          onMouseLeave={handleButtonMouseLeave}
          title="Previous Page (↑ or ←)"
        >
          {/* 玻璃效果背景 */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* 悬停时的发光效果 */}
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
               style={glowEffectStyles} />
          
          <svg className="relative w-4 h-4 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:text-slate-800 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>
        
        {/* 页码显示区域 - 可拖动 */}
        <div
          ref={numberButtonRef}
          className="relative w-10 h-6 sm:w-11 sm:h-7 lg:w-12 lg:h-8 rounded-2xl flex items-center justify-center transition-all duration-300 hover:scale-105 cursor-move overflow-hidden"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onDoubleClick={resetToDefaultPosition}
          title="Drag to move position, double-click to reset to default"
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
            ...getPageNumberBaseStyles()
          }}
          onMouseEnter={handlePageNumberMouseEnter}
          onMouseLeave={handlePageNumberMouseLeave}
        >
          {/* 玻璃效果背景 */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-2xl" />
          
          {/* 悬停时的发光效果 */}
          <div className="absolute inset-0 rounded-2xl opacity-0 hover:opacity-100 transition-opacity duration-300" 
               style={pageNumberGlowEffectStyles} />
          
          <span className="relative text-xs sm:text-xs lg:text-sm font-bold text-white tracking-wide drop-shadow-sm">
            {absolutePage}
          </span>
        </div>
        
        {/* 下一页按钮 */}
        <button
          onClick={() => handleCrossSectionNavigation('next')}
          disabled={!onSectionChange && isNextDisabled}
          className="group relative w-10 h-10 sm:w-11 sm:h-11 lg:w-12 lg:h-12 rounded-2xl flex items-center justify-center text-slate-600 hover:text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-300 ease-out hover:scale-105 active:scale-95 overflow-hidden"
          style={getButtonBaseStyles()}
          onMouseEnter={handleButtonMouseEnter}
          onMouseLeave={handleButtonMouseLeave}
          title="Next Page (↓ or →)"
        >
          {/* 玻璃效果背景 */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* 悬停时的发光效果 */}
          <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" 
               style={glowEffectStyles} />
          
          <svg className="relative w-4 h-4 sm:w-4.5 sm:h-4.5 lg:w-5 lg:h-5 transition-all duration-300 group-hover:translate-y-0.5 group-hover:text-slate-800 drop-shadow-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {/* 提示文字 */}
        <div className="hidden lg:block text-xs text-slate-600/80 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap backdrop-blur-sm px-2 py-1 rounded-lg" 
             style={{
               background: 'rgba(248, 250, 252, 0.8)',
               border: '1px solid rgba(51, 65, 85, 0.2)'
             }}>
          ↑↓ or ←→ to navigate
        </div>
      </div>
    </div>
  );
}
