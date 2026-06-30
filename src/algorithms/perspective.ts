// =========================================
// Wektorowa Transformacja Perspektywiczna
// =========================================

import { Point } from '../types';

function normalizePoints(points: Point[]): { normalized: Point[], T: number[][] } {
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x; cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  let meanDist = 0;
  for (const p of points) {
    meanDist += Math.sqrt((p.x - cx)**2 + (p.y - cy)**2);
  }
  meanDist /= points.length;

  const scale = Math.sqrt(2) / (meanDist === 0 ? 1 : meanDist);

  const normalized = points.map(p => ({
    x: (p.x - cx) * scale,
    y: (p.y - cy) * scale,
  }));

  const T = [
    [scale, 0, -scale * cx],
    [0, scale, -scale * cy],
    [0, 0, 1]
  ];

  return { normalized, T };
}

function multiply3x3(a: number[][], b: number[][]): number[][] {
  const result = [[0,0,0],[0,0,0],[0,0,0]];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) {
        result[r][c] += a[r][k] * b[k][c];
      }
    }
  }
  return result;
}

function inverse3x3(m: number[][]): number[][] {
  const det = m[0][0]*(m[1][1]*m[2][2] - m[2][1]*m[1][2]) -
              m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0]) +
              m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]);
  if (Math.abs(det) < 1e-12) return [[1,0,0],[0,1,0],[0,0,1]];
  const invdet = 1/det;
  return [
    [ (m[1][1]*m[2][2] - m[2][1]*m[1][2])*invdet, (m[0][2]*m[2][1] - m[0][1]*m[2][2])*invdet, (m[0][1]*m[1][2] - m[0][2]*m[1][1])*invdet ],
    [ (m[1][2]*m[2][0] - m[1][0]*m[2][2])*invdet, (m[0][0]*m[2][2] - m[0][2]*m[2][0])*invdet, (m[1][0]*m[0][2] - m[0][0]*m[1][2])*invdet ],
    [ (m[1][0]*m[2][1] - m[2][0]*m[1][1])*invdet, (m[2][0]*m[0][1] - m[0][0]*m[2][1])*invdet, (m[0][0]*m[1][1] - m[1][0]*m[0][1])*invdet ]
  ];
}

/**
 * Oblicza znormalizowaną macierz homografii (Hartley's Normalization + DLT).
 */
export function getPerspectiveTransform(src: Point[], dst: Point[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) return null;

  const srcNorm = normalizePoints(src);
  const dstNorm = normalizePoints(dst);

  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = srcNorm.normalized[i];
    const u = dstNorm.normalized[i].x;
    const v = dstNorm.normalized[i].y;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }

  // Eliminacja Gaussa
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

    if (Math.abs(a[col][col]) < 1e-12) {
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

  const H_norm = [
    [h[0], h[1], h[2]],
    [h[3], h[4], h[5]],
    [h[6], h[7], h[8], 1]
  ];
  H_norm[2][2] = 1;

  const T_dst_inv = inverse3x3(dstNorm.T);
  const M1 = multiply3x3(T_dst_inv, H_norm);
  const H_final = multiply3x3(M1, srcNorm.T);

  const w = H_final[2][2];
  if (Math.abs(w) > 1e-12) {
    return [
      H_final[0][0]/w, H_final[0][1]/w, H_final[0][2]/w,
      H_final[1][0]/w, H_final[1][1]/w, H_final[1][2]/w,
      H_final[2][0]/w, H_final[2][1]/w, 1
    ];
  } else {
    return [
      H_final[0][0], H_final[0][1], H_final[0][2],
      H_final[1][0], H_final[1][1], H_final[1][2],
      H_final[2][0], H_final[2][1], H_final[2][2]
    ];
  }
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
