'use client';

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
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
    if (!mounted) {
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    loadSearchIndex()
      .then((searchIndex) => {
        if (isCancelled) {
          return;
        }

        setIndex(searchIndex);
        setIsLoading(false);
      })
      .catch((loadError: unknown) => {
        if (isCancelled) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load search index');
        setIsLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [mounted]);

  const value = useMemo<SearchIndexContextType>(
    () => ({
      index,
      isLoading,
      isReady: !!index && !isLoading,
      error,
    }),
    [error, index, isLoading]
  );

  if (!mounted) {
    return (
      <SearchIndexContext.Provider
        value={{ index: null, isLoading: false, isReady: false, error: null }}
      >
        {children}
      </SearchIndexContext.Provider>
    );
  }

  return <SearchIndexContext.Provider value={value}>{children}</SearchIndexContext.Provider>;
}

export function useSearchIndex() {
  return useContext(SearchIndexContext);
}
