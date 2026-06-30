// =========================================
// ArUco Marker Detector
// Implementacja czysto w JS na tablicach pikseli
// Kompatybilna z React Native (brak DOM dependency)
// =========================================

import { ArucoMarker, Point, MarkerType } from '../types';
import { SentinelLogger } from '../utils/logger';

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

function globalThreshold(
  gray: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  const binary = new Uint8Array(width * height);
  
  // Otsu's method: oblicz histogram i znajdź optymalny próg binaryzacji
  const histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) {
    histogram[gray[i]]++;
  }
  
  const total = gray.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * histogram[i];
  
  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let bestThreshold = 128;
  
  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    
    sumB += t * histogram[t];
    const meanB = sumB / wB;
    const meanF = (sumAll - sumB) / wF;
    const variance = wB * wF * (meanB - meanF) * (meanB - meanF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      bestThreshold = t;
    }
  }

  for (let i = 0; i < gray.length; i++) {
    binary[i] = gray[i] < bestThreshold ? 1 : 0;
  }
  
  console.log('[ArUco] Otsu threshold:', bestThreshold, '| image:', width, 'x', height);
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

function getCorners(comp: Point[], binary: Uint8Array, width: number, height: number): [Point, Point, Point, Point] {
  // 1. Zgrubne rogi ze starego algorytmu (są narażone na szum)
  const rough = getCornersFast(comp);

  // 2. Znajdź piksele brzegowe markera
  const boundary: Point[] = [];
  const compSet = new Set(comp.map(p => p.y * width + p.x));
  
  for (const p of comp) {
    const { x, y } = p;
    // Sprawdzamy sąsiadów. Jeśli któryś leży poza maską `binary`, to jest to brzeg markera.
    const isBoundary = 
      x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1 ||
      binary[(y - 1) * width + x] === 0 ||
      binary[(y + 1) * width + x] === 0 ||
      binary[y * width + (x - 1)] === 0 ||
      binary[y * width + (x + 1)] === 0;
      
    if (isBoundary) {
      boundary.push(p);
    }
  }

  // 3. Rozdziel piksele brzegowe na 4 krawędzie (Top, Right, Bottom, Left)
  const edges: Point[][] = [[], [], [], []];
  
  for (const p of boundary) {
    let minDist = Infinity;
    let bestEdge = -1;
    let bestProj = 0;

    for (let i = 0; i < 4; i++) {
      const p1 = rough[i];
      const p2 = rough[(i + 1) % 4];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      
      const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / len2;
      const projX = p1.x + t * dx;
      const projY = p1.y + t * dy;
      const dist = (p.x - projX) ** 2 + (p.y - projY) ** 2;
      
      if (dist < minDist) {
        minDist = dist;
        bestEdge = i;
        bestProj = t;
      }
    }

    // Używamy tylko pikseli z odległości < 25 (5px) od zgrubnej linii.
    // ODRZUCAMY 20% krawędzi przy rogach (bestProj > 0.2 && < 0.8), by wyeliminować wpływ zaokrągleń soczewki!
    if (bestEdge !== -1 && minDist < 25 && bestProj > 0.2 && bestProj < 0.8) {
      edges[bestEdge].push(p);
    }
  }

  // 4. Dopasowanie linii ortogonalnych (PCA / regresja najmniejszych kwadratów) do każdej krawędzi
  const lines = edges.map(edgePts => {
    if (edgePts.length < 5) return null; // Brak wystarczającej liczby pikseli na prostą

    let cx = 0, cy = 0;
    for (const p of edgePts) { cx += p.x; cy += p.y; }
    cx /= edgePts.length;
    cy /= edgePts.length;

    let Ixx = 0, Iyy = 0, Ixy = 0;
    for (const p of edgePts) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      Ixx += dx * dx;
      Iyy += dy * dy;
      Ixy += dx * dy;
    }

    // Kąt wariancji (Eigenvector dla smallest eigenvalue)
    const theta = 0.5 * Math.atan2(2 * Ixy, Ixx - Iyy);
    const vx = Math.cos(theta);
    const vy = Math.sin(theta);
    
    const nx = -vy;
    const ny = vx;
    const d = nx * cx + ny * cy;
    
    return { nx, ny, d };
  });

  // 5. Krzyżowanie wyliczonych linii subpikselowych celem znalezienia absolutnych rogów
  const trueCorners: Point[] = [];
  for (let i = 0; i < 4; i++) {
    const l1 = lines[i];
    const l2 = lines[(i + 1) % 4];
    
    // Fallback: jeśli obiektyw całkowicie rozmył krawędź, używamy zgrubnego rogu
    if (!l1 || !l2) {
      trueCorners.push(rough[(i + 1) % 4]);
      continue;
    }
    
    const det = l1.nx * l2.ny - l1.ny * l2.nx;
    if (Math.abs(det) < 1e-6) {
      trueCorners.push(rough[(i + 1) % 4]);
      continue;
    }
    
    // Punkt przecięcia 2 prostych (Subpixel Corner)
    const x = (l1.d * l2.ny - l2.d * l1.ny) / det;
    const y = (l1.nx * l2.d - l2.nx * l1.d) / det;
    trueCorners.push({ x, y });
  }

  // Zwracamy posortowane węzły
  return [trueCorners[3], trueCorners[0], trueCorners[1], trueCorners[2]];
}

function getCornersFast(points: Point[]): [Point, Point, Point, Point] {
  // 1. Wylicz środek ciężkości markera
  let cx = 0, cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;

  // 2. Znajdź punkt A najdalszy od środka ciężkości (gwarantowany narożnik)
  let A = points[0];
  let maxDistA = -1;
  for (const p of points) {
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d > maxDistA) {
      maxDistA = d;
      A = p;
    }
  }

  // 3. Znajdź punkt C najdalszy od punktu A (przeciwległy narożnik na przekątnej)
  let C = points[0];
  let maxDistC = -1;
  for (const p of points) {
    const d = (p.x - A.x) ** 2 + (p.y - A.y) ** 2;
    if (d > maxDistC) {
      maxDistC = d;
      C = p;
    }
  }

  // 4. Znajdź punkty B i D leżące najdalej od linii AC (pozostałe dwa narożniki)
  let B = points[0];
  let D = points[0];
  let maxPosDist = -Infinity;
  let maxNegDist = Infinity;

  const dy = C.y - A.y;
  const dx = C.x - A.x;
  const c = C.x * A.y - C.y * A.x;

  for (const p of points) {
    const dist = dy * p.x - dx * p.y + c;
    if (dist > maxPosDist) {
      maxPosDist = dist;
      B = p;
    }
    if (dist < maxNegDist) {
      maxNegDist = dist;
      D = p;
    }
  }

  // 5. Uporządkuj narożniki [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
  // używając kąta atan2 z ich środka geometrycznego.
  const corners = [A, B, C, D];
  
  let ccx = 0, ccy = 0;
  for (const p of corners) {
    ccx += p.x;
    ccy += p.y;
  }
  ccx /= 4;
  ccy /= 4;

  corners.sort((p1, p2) => {
    const a1 = Math.atan2(p1.y - ccy, p1.x - ccx);
    const a2 = Math.atan2(p2.y - ccy, p2.x - ccx);
    return a1 - a2;
  });

  return [corners[0], corners[1], corners[2], corners[3]];
}

function isSquarish(
  minX: number, minY: number, maxX: number, maxY: number
): boolean {
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 15 || h < 15) return false;
  const ratio = Math.min(w, h) / Math.max(w, h);
  return ratio > 0.75; // przynajmniej 75% zbliżone do kwadratu (eliminacja cieni i zagięć)
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
  imageHeight: number,
  markerType: MarkerType = 'aruco'
): ArucoMarker | null {
  try {
    // 1. Skalowanie do max 1200px dla wydajności przy zachowaniu detali Aruco
    let processWidth = imageWidth;
    let processHeight = imageHeight;
    let processData = pixelData;
    let scale = 1;

    if (imageWidth > 1200) {
      scale = imageWidth / 1200;
      processWidth = 1200;
      processHeight = Math.round(imageHeight / scale);
      processData = downsampleRGBA(pixelData, imageWidth, imageHeight, processWidth, processHeight);
    }

    // 2. Grayscale
    const gray = toGrayscale(processData, processWidth, processHeight);

    // 3. Global threshold (Otsu)
    const binary = globalThreshold(gray, processWidth, processHeight);

    // 4. Znajdź komponenty
    const components = findConnectedComponents(binary, processWidth, processHeight);
    console.log('[ArUco] Znaleziono komponentów:', components.length);

    // 5. Filtruj kwadratowe regiony pasujące wielkością markera
    const markerCandidates: ArucoMarker[] = [];

    for (const comp of components) {
      const { minX, minY, maxX, maxY } = getBoundingBox(comp);
      const w = maxX - minX;
      const h = maxY - minY;

      // Zaloguj tylko większe komponenty (żeby nie zaspamować logów śmieciami)
      const isBigEnoughToLog = w > processWidth * 0.05;

      if (markerType === 'aruco') {
        if (!isSquarish(minX, minY, maxX, maxY)) {
          if (isBigEnoughToLog) console.log(`[ArUco Reject] W: ${w}, H: ${h} -> Not squarish`);
          continue;
        }
      } else {
        // Tryb 'card' - karta ma wymiary 8.56x5.4 cm (ratio = 1.58).
        // Jednak obrócona pod kątem 45 stopni daje niemal kwadratowy Bounding Box.
        // Dlatego przepuszczamy ratio od 1.0 do 2.5
        const ratio = Math.max(w, h) / Math.min(w, h);
        if (ratio < 1.0 || ratio > 2.5) {
          if (isBigEnoughToLog) console.log(`[Card Reject] Ratio ${ratio.toFixed(2)} -> Not a card shape`);
          continue;
        }
      }

      // Marker powinien zajmować minimum 3% i max 60% szerokości obrazu
      if (w < processWidth * 0.03 || w > processWidth * 0.6) {
        if (isBigEnoughToLog) console.log(`[Reject] W: ${w} -> Out of size bounds (3%-60%)`);
        continue;
      }

      const bbox_area = w * h;
      const fill_ratio = comp.length / bbox_area;

      if (markerType === 'aruco') {
        // Klasyczny marker ma fill ratio w granicach 0.15 - 0.25
        if (fill_ratio < 0.15) {
          if (isBigEnoughToLog) console.log(`[ArUco Reject] W: ${w}, H: ${h} -> Fill ratio too low: ${fill_ratio.toFixed(2)}`);
          continue;
        }

        const borderOk = checkSolidBorder(binary, processWidth, minX, minY, maxX, maxY);
        if (!borderOk) {
          if (isBigEnoughToLog) console.log(`[ArUco Reject] BorderGuard W: ${w}, H: ${h} -> rejected`);
          continue;
        }

        const varianceOk = checkInnerVariance(binary, processWidth, minX, minY, maxX, maxY);
        if (!varianceOk) {
          if (isBigEnoughToLog) console.log(`[ArUco Reject] VarianceGuard W: ${w}, H: ${h} -> rejected (smooth surface)`);
          continue;
        }
      } else {
        // Tryb 'card' - Karta to pełny prostokąt. Ale jeśli jest obrócona o 45 stopni,
        // jej Bounding Box jest ponad dwukrotnie większy, przez co fill_ratio spada do ~0.45!
        if (fill_ratio < 0.35) {
          if (isBigEnoughToLog) console.log(`[Card Reject] W: ${w}, H: ${h} -> Fill ratio too low for card: ${fill_ratio.toFixed(2)}`);
          continue; 
        }
      }

      // Oblicz precyzyjne narożniki z komponentu (Subpixel Edge Intersection)
      const compCorners = getCorners(comp, binary, processWidth, processHeight);
      const corners: [Point, Point, Point, Point] = [
        { x: compCorners[0].x * scale, y: compCorners[0].y * scale },
        { x: compCorners[1].x * scale, y: compCorners[1].y * scale },
        { x: compCorners[2].x * scale, y: compCorners[2].y * scale },
        { x: compCorners[3].x * scale, y: compCorners[3].y * scale },
      ];

      const s1 = distance(corners[0], corners[1]);
      const s2 = distance(corners[1], corners[2]);
      const s3 = distance(corners[2], corners[3]);
      const s4 = distance(corners[3], corners[0]);
      const sidePixels = (s1 + s2 + s3 + s4) / 4;

      console.log('[ArUco] Kandydat:', w, 'x', h, 'px, fill:', (fill_ratio * 100).toFixed(0) + '%',
        '| pos:', minX, minY, '| sidePixels:', sidePixels);

      // ARUCO RE-WRITE: 
      // Zapisujemy Fill Ratio (Gęstość pikseli ArUco to solidny, gruby obrys wewnątrz 10x10)
      markerCandidates.push({
        id: 1,
        corners,
        sidePixels,
        fillRatio: fill_ratio,
      } as any);
    }

    if (markerCandidates.length === 0) {
      SentinelLogger.error('ArUco', 'detectMarker', 'Brak zweryfikowanych kandydatów');
      return null;
    }

    // Wybierz kandydata z MINIMALNYM sidePixels który przeszedł wszystkie filtry.
    // Kołdra generuje duże false positive — prawdziwy marker jest mniejszy.
    // Filtrujemy kandydatów którzy mają sidePixels > 30px (eliminuje drobny szum)
    // i sortujemy rosnąco — najmniejszy który przeszedł filtry to najprawdopodobniej marker.
    const validCandidates = markerCandidates.filter(c => c.sidePixels > 30);
    
    if (validCandidates.length === 0) {
      SentinelLogger.error('ArUco', 'detectMarker', 'Brak kandydatów > 30px');
      return null;
    }

    // Sortuj rosnąco — prawdziwy ArUco jest zwykle mniejszy niż wzory tła
    validCandidates.sort((a, b) => a.sidePixels - b.sidePixels);
    SentinelLogger.success('ArUco', 'detectMarker', { 
      sidePixels: validCandidates[0].sidePixels,
      totalCandidates: validCandidates.length 
    });
    return validCandidates[0];

  } catch (e) {
    SentinelLogger.error('ArUco', 'detectMarker', e);
    return null;
  }
}

function checkSolidBorder(
  binary: Uint8Array,
  width: number,
  minX: number, minY: number,
  maxX: number, maxY: number
): boolean {
  const w = maxX - minX;
  const h = maxY - minY;
  const sampleStep = Math.max(1, Math.floor(Math.min(w, h) / 16));

  let darkCount = 0;
  let totalSamples = 0;

  // Próbkuj ZEWNĘTRZNY pas (~1/6 szerokości) — to jest czarna ramka ArUco
  const borderThickness = Math.max(2, Math.floor(Math.min(w, h) / 6));

  // Górna krawędź (pas borderThickness w dół)
  for (let x = minX; x <= maxX; x += sampleStep) {
    for (let by = 0; by < borderThickness; by++) {
      const y = minY + by;
      if (x >= 0 && x < width && y >= 0) {
        if (binary[y * width + x] === 1) darkCount++;
        totalSamples++;
      }
    }
  }
  // Dolna krawędź
  for (let x = minX; x <= maxX; x += sampleStep) {
    for (let by = 0; by < borderThickness; by++) {
      const y = maxY - by;
      if (x >= 0 && x < width && y >= 0 && y < binary.length / width) {
        if (binary[y * width + x] === 1) darkCount++;
        totalSamples++;
      }
    }
  }
  // Lewa krawędź
  for (let y = minY; y <= maxY; y += sampleStep) {
    for (let bx = 0; bx < borderThickness; bx++) {
      const x = minX + bx;
      if (x >= 0 && x < width && y >= 0 && y < binary.length / width) {
        if (binary[y * width + x] === 1) darkCount++;
        totalSamples++;
      }
    }
  }
  // Prawa krawędź
  for (let y = minY; y <= maxY; y += sampleStep) {
    for (let bx = 0; bx < borderThickness; bx++) {
      const x = maxX - bx;
      if (x >= 0 && x < width && y >= 0 && y < binary.length / width) {
        if (binary[y * width + x] === 1) darkCount++;
        totalSamples++;
      }
    }
  }

  const ratio = totalSamples > 0 ? darkCount / totalSamples : 0;
  return ratio > 0.70; // ArUco ma >70% czarnej ramki, kołdra nie
}

function checkInnerVariance(
  binary: Uint8Array,
  width: number,
  minX: number, minY: number,
  maxX: number, maxY: number
): boolean {
  const w = maxX - minX;
  const h = maxY - minY;
  // Badamy samo "serce" by pominąć ew. zewnętrzne zakłócenia (margines 25%)
  const padX = Math.floor(w * 0.25);
  const padY = Math.floor(h * 0.25);
  
  let white = 0;
  let black = 0;
  for(let y = minY + padY; y < maxY - padY; y+=2) {
    for(let x = minX + padX; x < maxX - padX; x+=2) {
      if (binary[y * width + x] === 1) black++;
      else white++;
    }
  }
  const total = white + black;
  if (total === 0) return false;
  const whiteRatio = white / total;
  // Prawdziwy kod ma białe moduły na czarnym tle. 
  // Gładka koszulka da blisko 0% bieli (sama czerń ze szwu) albo 100% bieli z plamy
  return whiteRatio > 0.10 && whiteRatio < 0.90;
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
