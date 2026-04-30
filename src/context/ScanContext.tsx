'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { ScanResults } from '@/lib/metrics';

const STORAGE_KEY         = 'bodyanalyzer_results';
const HISTORY_STORAGE_KEY = 'bodyanalyzer_history';
const MAX_HISTORY         = 10;

interface ScanContextType {
  results:    ScanResults | null;
  history:    ScanResults[];
  isHydrated: boolean;
  setResults:   (r: ScanResults) => void;
  clearResults: () => void;
  clearHistory: () => void;
}

const ScanContext = createContext<ScanContextType>({
  results:      null,
  history:      [],
  isHydrated:   false,
  setResults:   () => {},
  clearResults: () => {},
  clearHistory: () => {},
});

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const [results,    setResultsState]  = useState<ScanResults | null>(null);
  const [history,    setHistoryState]  = useState<ScanResults[]>([]);
  const [isHydrated, setIsHydrated]   = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setResultsState(JSON.parse(saved));
    } catch {}
    try {
      const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (savedHistory) setHistoryState(JSON.parse(savedHistory));
    } catch {}
    setIsHydrated(true);
  }, []);

  const setResults = (r: ScanResults) => {
    setResultsState(r);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch {}

    // Add to history (dedupe same scanDate, keep latest MAX_HISTORY entries)
    setHistoryState(prev => {
      const newEntry  = { ...r, scanDate: r.scanDate ?? new Date().toISOString() };
      const filtered  = prev.filter(h => h.scanDate !== newEntry.scanDate);
      const updated   = [newEntry, ...filtered].slice(0, MAX_HISTORY);
      try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  const clearResults = () => {
    setResultsState(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  };

  const clearHistory = () => {
    setHistoryState([]);
    try { localStorage.removeItem(HISTORY_STORAGE_KEY); } catch {}
  };

  return (
    <ScanContext.Provider value={{ results, history, isHydrated, setResults, clearResults, clearHistory }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  return useContext(ScanContext);
}
