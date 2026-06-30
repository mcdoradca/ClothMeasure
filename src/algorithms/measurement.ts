// =========================================
// Measurement Engine
// px → cm z korekcją perspektywy
// =========================================

import { ArucoMarker, GarmentMeasurements, GarmentType, MeasurementLine, Point, MarkerType } from '../types';
import { measureWidthAtY } from './edgeDetection';

import { getPerspectiveTransform } from './perspective';

// Standardowe rozmiary obiektów referencyjnych
const REFERENCE_SIZES: Record<string, { widthCm: number; heightCm: number }> = {
  aruco_10cm: { widthCm: 10, heightCm: 10 },
  credit_card: { widthCm: 8.56, heightCm: 5.4 },
  a4_paper: { widthCm: 21.0, heightCm: 29.7 },
};

export interface MeasurementContext {
  pixelPerCm: number;
  homographyMatrix?: number[];
  referenceType: 'aruco' | 'credit_card' | 'a4' | 'unknown';
  confidence: number;
}

/**
 * Oblicz skalę px/cm na podstawie wykrytego markera ArUco
 * Marker jest drukowany jako 10x10 cm
 */
export function calculatePixelPerCm(marker: ArucoMarker, markerType: MarkerType): MeasurementContext {
  // Średnia długość boku markera w px z 4 boków, czyli (obwódPx / 4)
  const markerSidePx = marker.sidePixels;

  // Perimeter (Obwód)
  // ArUco: 10 + 10 + 10 + 10 = 40 cm
  // Card: 8.56 + 5.40 + 8.56 + 5.40 = 27.92 cm
  const perimeterCm = markerType === 'card' ? 27.92 : 40;
  
  // pixelPerCm na podstawie całego obwodu (odporność na zniekształcenia perspektywy boków)
  const pixelPerCm = (markerSidePx * 4) / perimeterCm;

  // dst corners w CM! (Homografia dla karty wymaga orientacji proporcji)
  let MARKER_W = 10;
  let MARKER_H = 10;

  if (markerType === 'card') {
    // Sprawdzamy orientację karty na zdjęciu (czy leży poziomo czy pionowo)
    const dx1 = marker.corners[0].x - marker.corners[1].x;
    const dy1 = marker.corners[0].y - marker.corners[1].y;
    const s1 = Math.sqrt(dx1 * dx1 + dy1 * dy1); // Szerokość (góra)
    
    const dx2 = marker.corners[1].x - marker.corners[2].x;
    const dy2 = marker.corners[1].y - marker.corners[2].y;
    const s2 = Math.sqrt(dx2 * dx2 + dy2 * dy2); // Wysokość (prawy bok)

    if (s1 > s2) {
      MARKER_W = 8.56;
      MARKER_H = 5.40;
    } else {
      MARKER_W = 5.40;
      MARKER_H = 8.56;
    }
  }
  
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: MARKER_W, y: 0 },
    { x: MARKER_W, y: MARKER_H },
    { x: 0, y: MARKER_H },
  ];

  const homographyMatrix = getPerspectiveTransform(marker.corners, dst) || undefined;

  return {
    pixelPerCm,
    homographyMatrix,
    referenceType: markerType === 'card' ? 'credit_card' : 'aruco',
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
 * [HIBERNACJA - DEPRECATED w V1]
 * Oblicz wymiary ubrania na podstawie automatycznie detekowanego bounding box i mapy krawędzi.
 * Zastąpione w ADR 0005 przez ManualUI (PanResponder) i odległości Euklidesowe.
 * Zostawione w kodzie dla rozwoju V2 (zewnętrzne API segmentacyjne).
 */
export function calculateGarmentMeasurements(
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number },
  edges: Uint8Array,
  imageWidth: number,
  imageHeight: number,
  context: MeasurementContext,
  markerExcludeBox?: { minX: number; minY: number; maxX: number; maxY: number }
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
  const shoulderMeasure = measureWidthAtY(edges, imageWidth, shoulderY, markerExcludeBox);

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
  const chestMeasure = measureWidthAtY(edges, imageWidth, chestY, markerExcludeBox);
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
  const waistMeasure = measureWidthAtY(edges, imageWidth, waistY, markerExcludeBox);
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
    const hipsMeasure = measureWidthAtY(edges, imageWidth, hipsY, markerExcludeBox);
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

/**
 * [MANUAL UI]
 * Oblicz odległość euklidesową w centymetrach między dwoma punktami x/y.
 */
export function calculateDistanceCm(p1: Point, p2: Point, pixelPerCm: number): number {
  if (pixelPerCm <= 0) return 0;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const distancePx = Math.sqrt(dx * dx + dy * dy);
  return roundToHalfCm(distancePx / pixelPerCm);
}
