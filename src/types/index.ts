// =========================================
// ClothMeasure — Typy globalne
// =========================================

export type GarmentType =
  | 'shirt'
  | 'tshirt'
  | 'pants'
  | 'dress'
  | 'jacket'
  | 'shorts'
  | 'skirt'
  | 'unknown';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArucoMarker {
  id: number;
  corners: [Point, Point, Point, Point]; // TL, TR, BR, BL
  sidePixels: number;                    // średnia długość boku w px
}

export interface MeasurementLine {
  start: Point;
  end: Point;
  valueCm: number;
  label: string;
  color: string;
}

export interface GarmentMeasurements {
  garmentType: GarmentType;
  width: number;       // szerokość w cm (np. ramię do ramienia)
  length: number;      // długość w cm
  shoulder?: number;   // szerokość ramion
  chest?: number;      // obwód klatki (przybliżony)
  waist?: number;      // talia
  hips?: number;       // biodra
  inseam?: number;     // nogawka (spodnie)
  sleeve?: number;     // długość rękawa
  lines: MeasurementLine[];
  confidence: number;  // 0-1
}

export interface ProcessingResult {
  success: boolean;
  imageUri: string;           // URI annotowanego zdjęcia
  annotatedImageBase64: string; // base64 zdjęcia z pomiarami
  measurements: GarmentMeasurements | null;
  errorMessage?: string;
  processingTimeMs: number;
  pixelPerCm: number;
  homographyMatrix?: number[];
  markerFound: boolean;
  imageWidth?: number;
  imageHeight?: number;
  arucoCorners?: [Point, Point, Point, Point];
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  imageUri: string;
  measurements: GarmentMeasurements;
  garmentName?: string;
}
