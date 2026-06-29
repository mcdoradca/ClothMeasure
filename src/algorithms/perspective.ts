// =========================================
// Wektorowa Transformacja Perspektywiczna
// =========================================

import { Point } from '../types';

/**
 * Oblicza macierz homografii 3x3 na podstawie 4 par punktów bazując na 
 * Direct Linear Transformation (DLT).
 * Odpowiednik: cv2.getPerspectiveTransform(src, dst)
 */
export function getPerspectiveTransform(src: Point[], dst: Point[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const u = dst[i].x;
    const v = dst[i].y;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  // Eliminacja Gaussa na macierzy 8x9
  for (let col = 0; col < 8; col++) {
    let max = col;
    for (let row = col + 1; row < 8; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[max][col])) {
        max = row;
      }
    }

    const tmp = a[col];
    a[col] = a[max];
    a[max] = tmp;

    // Jeżeli oś jest bliska zera, macierz osobliwa
    if (Math.abs(a[col][col]) < 1e-10) {
      return null;
    }

    for (let row = col + 1; row < 8; row++) {
      const f = a[row][col] / a[col][col];
      for (let j = col; j <= 8; j++) {
        a[row][j] -= a[col][j] * f;
      }
    }
  }

  const h = new Array(8).fill(0);
  for (let row = 7; row >= 0; row--) {
    let sum = a[row][8];
    for (let j = row + 1; j < 8; j++) {
      sum -= a[row][j] * h[j];
    }
    h[row] = sum / a[row][row];
  }

  // Wypełniamy macierz h 9 elementem h33 = 1
  return [...h, 1];
}

/**
 * Transformuje punkt (x,y) z oryginalnego skośnego obrazu do płaskiej przestrzeni
 * ustandaryzowanej (gdzie 1 jednostka może oznaczać 1 cm), używając macierzy homografii.
 */
export function applyHomography(p: Point, h: number[]): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}
