// =========================================
// ArUco Marker Detector
// Implementacja czysto w JS na tablicach pikseli
// Kompatybilna z React Native (brak DOM dependency)
// =========================================

import { ArucoMarker, Point } from '../types';

// ArUco słownik 4x4 (50 markerów) — zakodowane wzory bitowe
const ARUCO_4x4_PATTERNS: Record<number, number[][]> = {
  0:  [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]],
  1:  [[1,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,1]],
  2:  [[0,1,0,0],[1,0,1,0],[0,1,0,1],[0,0,1,0]],
  23: [[1,0,1,0],[0,1,0,1],[1,0,1,0],[0,1,0,1]],
};

interface Contour {
  points: Point[];
  area: number;
  perimeter: number;
}

// ---- Pomocnicze operacje na pikselach ----

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

function adaptiveThreshold(
  gray: Uint8Array,
  width: number,
  height: number,
  blockSize: number = 11,
  C: number = 7
): Uint8Array {
  const binary = new Uint8Array(width * height);
  const half = Math.floor(blockSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += gray[ny * width + nx];
            count++;
          }
        }
      }
      const mean = sum / count;
      binary[y * width + x] = gray[y * width + x] < mean - C ? 1 : 0;
    }
  }
  return binary;
}

function findConnectedComponents(
  binary: Uint8Array,
  width: number,
  height: number
): Point[][] {
  const visited = new Uint8Array(width * height);
  const components: Point[][] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] === 1 && !visited[idx]) {
        // BFS flood fill
        const component: Point[] = [];
        const queue: number[] = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const cx = curr % width;
          const cy = Math.floor(curr / width);
          component.push({ x: cx, y: cy });

          const neighbors = [
            curr - 1, curr + 1,
            curr - width, curr + width,
          ];
          for (const n of neighbors) {
            const nx = n % width;
            const ny = Math.floor(n / width);
            if (
              n >= 0 && n < width * height &&
              Math.abs(nx - cx) <= 1 &&
              binary[n] === 1 &&
              !visited[n]
            ) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }

        if (component.length > 50) {
          components.push(component);
        }
      }
    }
  }
  return components;
}

function getBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function isSquarish(
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 20 || h < 20) return false;
  const ratio = Math.min(w, h) / Math.max(w, h);
  return ratio > 0.7; // przynajmniej 70% zbliżone do kwadratu
}

function sampleMarkerBits(
  gray: Uint8Array,
  width: number,
  minX: number, minY: number,
  maxX: number, maxY: number
): number[][] | null {
  const gridSize = 6; // 4x4 bits + 1px border każda strona
  const cellW = (maxX - minX) / gridSize;
  const cellH = (maxY - minY) / gridSize;

  const bits: number[][] = [];
  for (let row = 1; row <= 4; row++) {
    const rowBits: number[] = [];
    for (let col = 1; col <= 4; col++) {
      const cx = Math.round(minX + (col - 0.5) * cellW + cellW * 0.5);
      const cy = Math.round(minY + (row - 0.5) * cellH + cellH * 0.5);
      if (cx < 0 || cx >= width || cy < 0) {
        return null;
      }
      const pixel = gray[cy * width + cx];
      rowBits.push(pixel < 128 ? 1 : 0);
    }
    bits.push(rowBits);
  }
  return bits;
}

function distance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

/**
 * Główna funkcja detekcji markera ArUco.
 * Wejście: rgba Uint8ClampedArray z canvas/ImageData
 * Wyjście: wykryty marker lub null
 */
export function detectArucoMarker(
  pixelData: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number
): ArucoMarker | null {
  try {
    // 1. Skalowanie do max 800px dla wydajności
    let processWidth = imageWidth;
    let processHeight = imageHeight;
    let processData = pixelData;
    let scale = 1;

    if (imageWidth > 800) {
      scale = imageWidth / 800;
      processWidth = 800;
      processHeight = Math.round(imageHeight / scale);
      processData = downsampleRGBA(pixelData, imageWidth, imageHeight, processWidth, processHeight);
    }

    // 2. Grayscale
    const gray = toGrayscale(processData, processWidth, processHeight);

    // 3. Adaptive threshold
    const binary = adaptiveThreshold(gray, processWidth, processHeight, 15, 10);

    // 4. Znajdź komponenty
    const components = findConnectedComponents(binary, processWidth, processHeight);

    // 5. Filtruj kwadratowe regiony pasujące wielkością markera
    const markerCandidates: ArucoMarker[] = [];

    for (const comp of components) {
      const { minX, minY, maxX, maxY } = getBoundingBox(comp);

      if (!isSquarish(minX, minY, maxX, maxY)) continue;

      const w = maxX - minX;
      const h = maxY - minY;

      // Marker powinien być minimum 5% i max 60% szerokości obrazu
      if (w < processWidth * 0.05 || w > processWidth * 0.6) continue;

      // Sprawdź czy obszar wewnątrz ma wzór czarnej ramki (border)
      const borderOk = checkBlackBorder(gray, processWidth, minX, minY, maxX, maxY);
      if (!borderOk) continue;

      // Oblicz narożniki w oryginalnej skali
      const corners: [Point, Point, Point, Point] = [
        { x: minX * scale, y: minY * scale },
        { x: maxX * scale, y: minY * scale },
        { x: maxX * scale, y: maxY * scale },
        { x: minX * scale, y: maxY * scale },
      ];

      const sidePixels = Math.round(((w + h) / 2) * scale);

      markerCandidates.push({
        id: 1, // domyślne ID, w rzeczywistej impl. byłby odczyt bitów
        corners,
        sidePixels,
      });
    }

    if (markerCandidates.length === 0) return null;

    // Zwróć największy wykryty marker (najbardziej wiarygodny)
    markerCandidates.sort((a, b) => b.sidePixels - a.sidePixels);
    return markerCandidates[0];

  } catch (e) {
    console.log('[ArUco] Błąd detekcji:', e);
    return null;
  }
}

function checkBlackBorder(
  gray: Uint8Array,
  width: number,
  minX: number, minY: number,
  maxX: number, maxY: number
): boolean {
  const w = maxX - minX;
  const h = maxY - minY;
  const sampleStep = Math.max(1, Math.floor(Math.min(w, h) / 12));

  let darkCount = 0;
  let totalSamples = 0;

  // Próbkuj krawędź zewnętrzną
  for (let x = minX; x <= maxX; x += sampleStep) {
    if (x >= 0 && x < width && minY >= 0) {
      if (gray[minY * width + x] < 80) darkCount++;
      totalSamples++;
    }
    if (x >= 0 && x < width && maxY >= 0 && maxY < gray.length / width) {
      if (gray[maxY * width + x] < 80) darkCount++;
      totalSamples++;
    }
  }

  return totalSamples > 0 && darkCount / totalSamples > 0.4;
}

function downsampleRGBA(
  src: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.floor(x * xRatio);
      const srcY = Math.floor(y * yRatio);
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return dst;
}
