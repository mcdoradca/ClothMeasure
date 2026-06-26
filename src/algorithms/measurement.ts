// =========================================
// Measurement Engine
// px → cm z korekcją perspektywy
// =========================================

import { ArucoMarker, GarmentMeasurements, GarmentType, MeasurementLine, Point } from '../types';
import { measureWidthAtY } from './edgeDetection';

// Standardowe rozmiary obiektów referencyjnych
const REFERENCE_SIZES: Record<string, { widthCm: number; heightCm: number }> = {
  aruco_10cm: { widthCm: 10, heightCm: 10 },
  credit_card: { widthCm: 8.56, heightCm: 5.4 },
  a4_paper: { widthCm: 21.0, heightCm: 29.7 },
};

export interface MeasurementContext {
  pixelPerCm: number;
  referenceType: 'aruco' | 'credit_card' | 'a4' | 'unknown';
  confidence: number;
}

/**
 * Oblicz skalę px/cm na podstawie wykrytego markera ArUco
 * Marker jest drukowany jako 10x10 cm
 */
export function calculatePixelPerCm(marker: ArucoMarker): MeasurementContext {
  // Średnia długość boku markera w px
  const markerSidePx = marker.sidePixels;

  // Marker referencyjny = 10 cm
  const MARKER_SIZE_CM = 10;

  const pixelPerCm = markerSidePx / MARKER_SIZE_CM;

  return {
    pixelPerCm,
    referenceType: 'aruco',
    confidence: markerSidePx > 100 ? 1.0 : markerSidePx > 50 ? 0.8 : 0.6,
  };
}

/**
 * Fallback: szacowanie skali na podstawie rozmiaru obrazu
 * (TYLKO gdy nie znaleziono markera — precyzja ~70%)
 */
export function estimatePixelPerCmFromImageSize(
  imageWidth: number,
  imageHeight: number
): MeasurementContext {
  // Heurystyka: przeciętna koszulka dorosłego to ~60cm szerokości
  // i zajmuje ~70% kadru
  const estimatedGarmentWidthPx = imageWidth * 0.7;
  const estimatedGarmentWidthCm = 60;

  return {
    pixelPerCm: estimatedGarmentWidthPx / estimatedGarmentWidthCm,
    referenceType: 'unknown',
    confidence: 0.5,
  };
}

/**
 * Oblicz wymiary ubrania na podstawie bounding box i mapy krawędzi
 */
export function calculateGarmentMeasurements(
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number },
  edges: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  context: MeasurementContext
): GarmentMeasurements {
  const { pixelPerCm } = context;
  const { minX, minY, maxX, maxY } = boundingBox;

  const widthPx = maxX - minX;
  const heightPx = maxY - minY;

  const widthCm = Math.round(widthPx / pixelPerCm);
  const lengthCm = Math.round(heightPx / pixelPerCm);

  // Wykryj typ ubrania na podstawie proporcji
  const garmentType = detectGarmentType(widthCm, lengthCm);

  // Oblicz szczegółowe wymiary wg typu
  const lines: MeasurementLine[] = [];
  let shoulder: number | undefined;
  let chest: number | undefined;
  let waist: number | undefined;
  let hips: number | undefined;
  let inseam: number | undefined;
  let sleeve: number | undefined;

  // Linia szerokości (górna część korpusu, obniżona do 25%, aby ominąć najwyższy punkt rękawów zniekształcający wymiar)
  const shoulderY = Math.round(minY + heightPx * 0.25);
  const shoulderMeasure = measureWidthAtY(edges, imageWidth, shoulderY);

  if (shoulderMeasure) {
    shoulder = Math.round(shoulderMeasure.widthPx / pixelPerCm);
    lines.push({
      start: { x: shoulderMeasure.leftX, y: shoulderY },
      end: { x: shoulderMeasure.rightX, y: shoulderY },
      valueCm: shoulder,
      label: 'Ramiona',
      color: '#00E5FF',
    });
  }

  // Linia klatki piersiowej (obniżona do 45% by mierzyć bezpośrednio pod pachami, a nie rozpiętość leżących rękawów!)
  const chestY = Math.round(minY + heightPx * 0.45);
  const chestMeasure = measureWidthAtY(edges, imageWidth, chestY);
  if (chestMeasure) {
    chest = Math.round(chestMeasure.widthPx / pixelPerCm);
    lines.push({
      start: { x: chestMeasure.leftX, y: chestY },
      end: { x: chestMeasure.rightX, y: chestY },
      valueCm: chest,
      label: 'Klatka',
      color: '#69FF47',
    });
  }

  // Talia (obniżona do 65%)
  const waistY = Math.round(minY + heightPx * 0.65);
  const waistMeasure = measureWidthAtY(edges, imageWidth, waistY);
  if (waistMeasure) {
    waist = Math.round(waistMeasure.widthPx / pixelPerCm);
    lines.push({
      start: { x: waistMeasure.leftX, y: waistY },
      end: { x: waistMeasure.rightX, y: waistY },
      valueCm: waist,
      label: 'Talia',
      color: '#FF6B6B',
    });
  }

  // Biodra (dół - 85%) — dla spodni/sukienek
  if (garmentType === 'pants' || garmentType === 'dress' || garmentType === 'skirt') {
    const hipsY = Math.round(minY + heightPx * 0.85);
    const hipsMeasure = measureWidthAtY(edges, imageWidth, hipsY);
    if (hipsMeasure) {
      hips = Math.round(hipsMeasure.widthPx / pixelPerCm);
      lines.push({
        start: { x: hipsMeasure.leftX, y: hipsY },
        end: { x: hipsMeasure.rightX, y: hipsY },
        valueCm: hips,
        label: 'Biodra',
        color: '#FFD700',
      });
    }
  }

  // Długość — linia pionowa
  lines.push({
    start: { x: Math.round((minX + maxX) / 2), y: minY },
    end: { x: Math.round((minX + maxX) / 2), y: maxY },
    valueCm: lengthCm,
    label: 'Długość',
    color: '#C77DFF',
  });

  // Szerokość — linia pozioma (całkowita)
  lines.push({
    start: { x: minX, y: Math.round((minY + maxY) / 2) },
    end: { x: maxX, y: Math.round((minY + maxY) / 2) },
    valueCm: widthCm,
    label: 'Szerokość',
    color: '#FF9F1C',
  });

  return {
    garmentType,
    width: widthCm,
    length: lengthCm,
    shoulder,
    chest,
    waist,
    hips,
    inseam,
    sleeve,
    lines,
    confidence: context.confidence,
  };
}

function detectGarmentType(widthCm: number, lengthCm: number): GarmentType {
  const ratio = lengthCm / widthCm;

  if (widthCm < 40 && lengthCm < 40) return 'shorts';
  if (ratio > 2.2 && widthCm < 50) return 'pants';
  if (ratio > 1.7 && widthCm < 60) return 'dress';
  if (ratio > 1.4 && widthCm > 60) return 'jacket';
  if (ratio > 1.4 && widthCm < 60) return 'skirt';
  
  // Jeśli proporcje są bliskie kwadratowi lub prostokątowi, 
  // domyślnie wybieramy t-shirt (najbardziej powszechny).
  // Koszula musiałaby mieć bardzo konkretne cechy (np. długie rękawy szeroko rozstawione).
  if (ratio < 0.6) return 'shirt'; // bardzo niska szeroka = rozłożona koszula z rękawami
  return 'tshirt';
}

/**
 * Zaokrąglenie do 0.5 cm (precyzja handlowa)
 */
export function roundToHalfCm(value: number): number {
  return Math.round(value * 2) / 2;
}
