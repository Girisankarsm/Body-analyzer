'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ScanResults } from '@/lib/metrics';

interface ScanContextType {
  results: ScanResults | null;
  isHydrated: boolean;
  setResults: (r: ScanResults) => void;
  clearResults: () => void;
}

const ScanContext = createContext<ScanContextType>({
  results: null,
  isHydrated: false,
  setResults: () => {},
  clearResults: () => {},
});

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [results, setResultsState] = useState<ScanResults | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('bodyanalyzer_results');
      if (saved) {
        setResultsState(JSON.parse(saved));
      }
    } catch {}
    setIsHydrated(true);
  }, []);

  const setResults = (r: ScanResults) => {
    setResultsState(r);
    try {
      localStorage.setItem('bodyanalyzer_results', JSON.stringify(r));
    } catch {}
  };

  const clearResults = () => {
    setResultsState(null);
    try {
      localStorage.removeItem('bodyanalyzer_results');
    } catch {}
  };

  return (
    <ScanContext.Provider value={{ results, isHydrated, setResults, clearResults }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  return useContext(ScanContext);
}
