// =========================================
// Zustand Store — globalny stan aplikacji
// =========================================

import { create } from 'zustand';
import { HistoryEntry, ProcessingResult } from '../types';
import * as FileSystem from 'expo-file-system/legacy';

interface MeasurementStore {
  // Aktualny wynik przetwarzania
  currentResult: ProcessingResult | null;
  setCurrentResult: (result: ProcessingResult | null) => void;

  // URI zdjęcia zrobionego kamerą
  capturedImageUri: string | null;
  setCapturedImageUri: (uri: string | null) => void;

  // Postęp przetwarzania
  processingProgress: number;
  processingStep: string;
  setProcessingProgress: (progress: number, step: string) => void;

  // Historia pomiarów
  history: HistoryEntry[];
  addToHistory: (result: ProcessingResult, name?: string) => void;
  deleteHistoryEntry: (id: string) => void;
  clearHistory: () => void;
  loadHistory: () => Promise<void>;

  // Tryb offline/debug
  debugMode: boolean;
  toggleDebugMode: () => void;
}

const HISTORY_FILE = (FileSystem.documentDirectory || '') + 'clothmeasure_history.json';

export const useMeasurementStore = create<MeasurementStore>((set, get) => ({
  currentResult: null,
  setCurrentResult: (result) => set({ currentResult: result }),

  capturedImageUri: null,
  setCapturedImageUri: (uri) => set({ capturedImageUri: uri }),

  processingProgress: 0,
  processingStep: '',
  setProcessingProgress: (progress, step) =>
    set({ processingProgress: progress, processingStep: step }),

  history: [],

  addToHistory: (result, name) => {
    if (!result.success || !result.measurements) return;

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      imageUri: result.imageUri,
      measurements: result.measurements,
      garmentName: name,
    };

    set((state) => {
      const newHistory = [entry, ...state.history].slice(0, 50); // max 50 wpisów
      // Zapisz do pliku w tle
      FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(newHistory)).catch((e) =>
        console.error('[Store] Błąd zapisu historii:', e)
      );
      return { history: newHistory };
    });
  },

  deleteHistoryEntry: (id) => {
    set((state) => {
      const newHistory = state.history.filter((e) => e.id !== id);
      FileSystem.writeAsStringAsync(HISTORY_FILE, JSON.stringify(newHistory)).catch(console.error);
      return { history: newHistory };
    });
  },

  clearHistory: () => {
    FileSystem.deleteAsync(HISTORY_FILE, { idempotent: true }).catch(console.error);
    set({ history: [] });
  },

  loadHistory: async () => {
    try {
      const exists = await FileSystem.getInfoAsync(HISTORY_FILE);
      if (exists.exists) {
        const data = await FileSystem.readAsStringAsync(HISTORY_FILE);
        const history = JSON.parse(data) as HistoryEntry[];
        set({ history });
      }
    } catch (e) {
      console.error('[Store] Błąd ładowania historii:', e);
    }
  },

  debugMode: false,
  toggleDebugMode: () => set((state) => ({ debugMode: !state.debugMode })),
}));
