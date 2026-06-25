// =========================================
// Edge Detection — algorytm Sobel/Canny w JS
// Czysta implementacja, bez zależności DOM
// =========================================

import { Point } from '../types';

/**
 * Gaussian blur 5x5 kernel
 */
function gaussianBlur(gray: Uint8Array, width: number, height: number): Uint8Array {
  const kernel = [
    2, 4, 5, 4, 2,
    4, 9, 12, 9, 4,
    5, 12, 15, 12, 5,
    4, 9, 12, 9, 4,
    2, 4, 5, 4, 2,
  ];
  const kernelSum = 159;
  const output = new Uint8Array(width * height);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      let sum = 0;
      let ki = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * kernel[ki++];
        }
      }
      output[y * width + x] = Math.round(sum / kernelSum);
    }
  }
  return output;
}

/**
 * Operator Sobel — oblicza gradienty Gx, Gy i magnitudę
 */
function sobelEdges(
  gray: Uint8Array,
  width: number,
  height: number
): { magnitude: Float32Array; direction: Float32Array } {
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = gray[(y - 1) * width + (x - 1)];
      const t  = gray[(y - 1) * width + x];
      const tr = gray[(y - 1) * width + (x + 1)];
      const l  = gray[y * width + (x - 1)];
      const r  = gray[y * width + (x + 1)];
      const bl = gray[(y + 1) * width + (x - 1)];
      const b  = gray[(y + 1) * width + x];
      const br = gray[(y + 1) * width + (x + 1)];

      const gx = -tl - 2 * l - bl + tr + 2 * r + br;
      const gy = -tl - 2 * t - tr + bl + 2 * b + br;

      magnitude[y * width + x] = Math.sqrt(gx * gx + gy * gy);
      direction[y * width + x] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, direction };
}

/**
 * Non-maximum suppression
 */
function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Float32Array,
  width: number,
  height: number
): Float32Array {
  const suppressed = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = direction[idx] * (180 / Math.PI);
      const normAngle = ((angle % 180) + 180) % 180;

      let n1 = 0, n2 = 0;

      if (normAngle < 22.5 || normAngle >= 157.5) {
        n1 = magnitude[y * width + (x - 1)];
        n2 = magnitude[y * width + (x + 1)];
      } else if (normAngle < 67.5) {
        n1 = magnitude[(y - 1) * width + (x + 1)];
        n2 = magnitude[(y + 1) * width + (x - 1)];
      } else if (normAngle < 112.5) {
        n1 = magnitude[(y - 1) * width + x];
        n2 = magnitude[(y + 1) * width + x];
      } else {
        n1 = magnitude[(y - 1) * width + (x - 1)];
        n2 = magnitude[(y + 1) * width + (x + 1)];
      }

      suppressed[idx] = magnitude[idx] >= n1 && magnitude[idx] >= n2 ? magnitude[idx] : 0;
    }
  }
  return suppressed;
}

/**
 * Double threshold + hysteresis
 */
function doubleThreshold(
  suppressed: Float32Array,
  width: number,
  height: number,
  lowRatio: number = 0.05,
  highRatio: number = 0.15
): Uint8Array {
  let maxVal = 0;
  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] > maxVal) maxVal = suppressed[i];
  }

  const lowThreshold = maxVal * lowRatio;
  const highThreshold = maxVal * highRatio;

  const edges = new Uint8Array(width * height);

  // Oznacz silne i słabe krawędzie
  const STRONG = 255;
  const WEAK = 128;

  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] >= highThreshold) {
      edges[i] = STRONG;
    } else if (suppressed[i] >= lowThreshold) {
      edges[i] = WEAK;
    }
  }

  // Hysteresis: słabe krawędzie połączone z silnymi → silne
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (edges[idx] === WEAK) {
        const neighbors = [
          edges[(y - 1) * width + (x - 1)],
          edges[(y - 1) * width + x],
          edges[(y - 1) * width + (x + 1)],
          edges[y * width + (x - 1)],
          edges[y * width + (x + 1)],
          edges[(y + 1) * width + (x - 1)],
          edges[(y + 1) * width + x],
          edges[(y + 1) * width + (x + 1)],
        ];
        if (neighbors.some(n => n === STRONG)) {
          edges[idx] = STRONG;
        } else {
          edges[idx] = 0;
        }
      }
    }
  }

  return edges;
}

/**
 * Pełny pipeline Canny edge detection.
 * Wejście: RGB/RGBA Uint8ClampedArray
 * Wyjście: mapa krawędzi (Uint8Array, 0 lub 255)
 */
export function cannyEdgeDetection(
  pixelData: Uint8ClampedArray,
  width: number,
  height: number,
  channels: 3 | 4 = 4
): Uint8Array {
  // Grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = pixelData[i * channels];
    const g = pixelData[i * channels + 1];
    const b = pixelData[i * channels + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  const blurred = gaussianBlur(gray, width, height);
  const { magnitude, direction } = sobelEdges(blurred, width, height);
  const suppressed = nonMaxSuppression(magnitude, direction, width, height);
  const edges = doubleThreshold(suppressed, width, height);

  return edges;
}

/**
 * Znajdź kontur (bounding box) największego obiektu na mapie krawędzi.
 * Zwraca punkty konturu do dalszych obliczeń.
 */
export function findClothingContour(
  edges: Uint8Array,
  width: number,
  height: number
): {
  boundingBox: { minX: number; minY: number; maxX: number; maxY: number };
  contourPoints: Point[];
  centerPoint: Point;
} | null {
  // Zbierz wszystkie punkty krawędzi
  const edgePoints: Point[] = [];

  // Pomiń skrajne 5% obrazu (zazwyczaj tam jest marker lub krawędź kadru)
  const margin = Math.round(width * 0.05);

  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      if (edges[y * width + x] === 255) {
        edgePoints.push({ x, y });
      }
    }
  }

  if (edgePoints.length < 100) return null;

  // Bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of edgePoints) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    boundingBox: { minX, minY, maxX, maxY },
    contourPoints: edgePoints,
    centerPoint: {
      x: Math.round((minX + maxX) / 2),
      y: Math.round((minY + maxY) / 2),
    },
  };
}

/**
 * Oblicz szerokość ubrania w konkretnym punkcie Y (przekrój poziomy).
 * Używane do estymacji bioder, klatki, talii.
 */
export function measureWidthAtY(
  edges: Uint8Array,
  width: number,
  targetY: number
): { leftX: number; rightX: number; widthPx: number } | null {
  let leftX = -1;
  let rightX = -1;

  for (let x = 0; x < width; x++) {
    if (edges[targetY * width + x] === 255) {
      if (leftX === -1) leftX = x;
      rightX = x;
    }
  }

  if (leftX === -1 || rightX === leftX) return null;

  return { leftX, rightX, widthPx: rightX - leftX };
}
