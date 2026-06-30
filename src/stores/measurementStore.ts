// =========================================
// Zustand Store — globalny stan aplikacji
// =========================================

import { create } from 'zustand';
import { HistoryEntry, ProcessingResult, MarkerType } from '../types';
import * as FileSystem from 'expo-file-system/legacy';
import { SentinelLogger } from '../utils/logger';

const HISTORY_FILE = FileSystem.documentDirectory + 'clothmeasure_history.json';

interface MeasurementState {
  capturedImageUri: string | null;
  currentResult: ProcessingResult | null;
  history: HistoryEntry[];
  processingProgress: number;
  processingStep: string;
  markerType: MarkerType;
  setMarkerType: (type: MarkerType) => void;
  setCapturedImageUri: (uri: string | null) => void;
  setCurrentResult: (res: ProcessingResult | null) => void;
  setProcessingProgress: (progress: number, step: string) => void;
  addToHistory: (entry: HistoryEntry) => void;
  deleteHistoryEntry: (id: string) => void;
  clearHistory: () => void;
  loadHistory: () => Promise<void>;
}

export const useMeasurementStore = create<MeasurementState>((set, get) => ({
  capturedImageUri: null,
  currentResult: null,
  history: [],
  processingProgress: 0,
  processingStep: '',
  markerType: 'aruco',

  setMarkerType: (type) => set({ markerType: type }),
  setCapturedImageUri: (uri) => set({ capturedImageUri: uri }),
  setCurrentResult: (res) => set({ currentResult: res }),
  setProcessingProgress: (progress, step) => set({ processingProgress: progress, processingStep: step }),

  addToHistory: (entry) => {
    SentinelLogger.start('Store', 'addToHistory', { id: entry.id });
    const newHistory = [entry, ...get().history];
    set({ history: newHistory });
    FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(newHistory))
      .then(() => SentinelLogger.success('Store', 'addToHistory'))
      .catch((e) => SentinelLogger.error('Store', 'addToHistory', e));
  },

  deleteHistoryEntry: (id) => {
    SentinelLogger.start('Store', 'deleteHistoryEntry', { id });
    const newHistory = get().history.filter(e => e.id !== id);
    set({ history: newHistory });
    FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(newHistory))
      .then(() => SentinelLogger.success('Store', 'deleteHistoryEntry'))
      .catch((e) => SentinelLogger.error('Store', 'deleteHistoryEntry', e));
  },

  clearHistory: () => {
    SentinelLogger.start('Store', 'clearHistory');
    set({ history: [] });
    FileSystem.deleteAsync(HISTORY_FILE, { idempotent: true })
      .then(() => SentinelLogger.success('Store', 'clearHistory'))
      .catch((e) => SentinelLogger.error('Store', 'clearHistory', e));
  },

  loadHistory: async () => {
    SentinelLogger.start('Store', 'loadHistory');
    try {
      const fileInfo = await FileSystem.getInfoAsync(HISTORY_FILE);
      if (fileInfo.exists) {
        const data = await FileSystem.readAsStringAsync(HISTORY_FILE);
        set({ history: JSON.parse(data) });
        SentinelLogger.success('Store', 'loadHistory', { count: JSON.parse(data).length });
      } else {
        SentinelLogger.success('Store', 'loadHistory (empty)');
      }
    } catch (e) {
      SentinelLogger.error('Store', 'loadHistory', e);
      set({ history: [] });
    }
  },
}));
