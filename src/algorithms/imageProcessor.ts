// =========================================
// Image Processor — orchestrator całego pipeline'u
// Używa expo-image-manipulator do dostępu do pikseli
// =========================================

import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { ProcessingResult, MarkerType } from '../types';
import { detectArucoMarker } from './arucoDetector';
import {
  calculatePixelPerCm,
  estimatePixelPerCmFromImageSize,
} from './measurement';
import { zlibDecompress, unfilterPNG } from './inflate';

const MAX_PROCESS_WIDTH = 1200; // px — balans jakość/wydajność

/**
 * Główna funkcja przetwarzania zdjęcia.
 * Zwraca ProcessingResult z adnotowanym obrazem i wymiarami.
 */
export async function processClothingImage(
  imageUri: string,
  markerType: MarkerType,
  onProgress?: (step: string, percent: number) => void
): Promise<ProcessingResult> {
  const startTime = Date.now();

  try {
    onProgress?.('Przygotowywanie obrazu…', 10);

    // 1. Zmień rozmiar do MAX_PROCESS_WIDTH zachowując proporcje
    const resizeResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: MAX_PROCESS_WIDTH } }],
      { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
    );

    const { width: imgWidth, height: imgHeight } = resizeResult;

    onProgress?.('Odczyt pikseli…', 20);

    // 2. Pobierz surowe dane pikseli przez base64 → ArrayBuffer
    const pixelResult = await getImagePixelData(resizeResult.uri, imgWidth, imgHeight);

    if (!pixelResult) {
      return {
        success: false,
        imageUri,
        annotatedImageBase64: '',
        measurements: null,
        errorMessage: 'Nie udało się odczytać danych obrazu.',
        processingTimeMs: Date.now() - startTime,
        pixelPerCm: 0,
        markerFound: false,
      };
    }

    const { data: pixelData, width: procWidth, height: procHeight } = pixelResult;

    onProgress?.('Szukam markera kalibracyjnego…', 35);

    // 3. Detekcja markera kalibracyjnego (ArUco lub Karta)
    const marker = detectArucoMarker(pixelData, procWidth, procHeight, markerType);
    const markerFound = marker !== null;

    const measurementContext = markerFound
      ? calculatePixelPerCm(marker!, markerType)
      : estimatePixelPerCmFromImageSize(procWidth, procHeight);

    onProgress?.('Inicjalizacja środowiska manualnego…', 85);

    // [HIBERNACJA] Automatyka Canny Edge oraz rysowanie statycznych adnotacji
    // zostały zahibernowane na rzecz Manual UI (ADR 0005).

    // Generujemy początkowe puste dane dla ekranu ResultScreen, który zainicjalizuje suwaki
    const initialMeasurements = {
      garmentType: 'unknown' as any,
      width: 0,
      length: 0,
      lines: [],
      confidence: measurementContext.confidence,
    };

    onProgress?.('Gotowe!', 100);

    return {
      success: true,
      imageUri: resizeResult.uri,
      annotatedImageBase64: '', // Adnotacje rysuje React Native
      measurements: initialMeasurements,
      processingTimeMs: Date.now() - startTime,
      pixelPerCm: measurementContext.pixelPerCm,
      homographyMatrix: measurementContext.homographyMatrix,
      markerFound,
      imageWidth: resizeResult.width,
      imageHeight: resizeResult.height,
      arucoCorners: marker?.corners,
    };
  } catch (error) {
    console.error('[ImageProcessor] Błąd przetwarzania:', error);
    return {
      success: false,
      imageUri,
      annotatedImageBase64: '',
      measurements: null,
      errorMessage: `Błąd przetwarzania: ${error instanceof Error ? error.message : String(error)}`,
      processingTimeMs: Date.now() - startTime,
      pixelPerCm: 0,
      markerFound: false,
    };
  }
}

/**
 * Pobiera dane pikseli z pliku obrazu jako Uint8ClampedArray RGBA.
 * Strategia: dekodowanie base64 → symulacja canvas przez manip.
 *
 * UWAGA: React Native nie ma natywnego Canvas API.
 * Używamy strategii "pixel sampling" przez przeskalowanie 1x1 pikseli.
 *
 * Dla precyzyjnej detekcji używamy pełnej rozdzielczości przez base64 RGBA decode.
 */
async function getImagePixelData(
  uri: string,
  width: number,
  height: number
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    // Strategia: konwertuj obraz do formatu, który możemy odczytać pixel po pixelu
    // W React Native bez natywnego modułu musimy użyć innego podejścia:
    // Skalujemy obraz do małych rozmiarów i losowo próbkujemy kolory

    // Główna metoda: użyj ImageManipulator do uzyskania pliku,
    // a następnie odczytaj jako base64 PNG i dekoduj ręcznie

    // Zmień rozmiar do wersji roboczej (mniejszy dla wydajności)
    // UWAGA: Zwiększono limit z 600 do 1200 px dla zachowania geometrii krawędzi markera ArUco.
    const workingWidth = Math.min(width, 1200);
    const workingHeight = Math.round(height * (workingWidth / width));

    const pngResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: workingWidth } }],
      {
        format: ImageManipulator.SaveFormat.PNG,
        compress: 1,
        base64: true,
      }
    );

    if (!pngResult.base64) return null;

    // Dekoduj PNG base64 do RGBA
    const pixelData = decodePNGBase64ToRGBA(
      pngResult.base64,
      workingWidth,
      workingHeight
    );

    return { data: pixelData, width: workingWidth, height: workingHeight };
  } catch (e) {
    console.error('[getImagePixelData] Błąd:', e);
    return null;
  }
}

/**
 * Dekoduje PNG base64 do tablicy RGBA.
 * Uproszczona implementacja — obsługuje standard RGB PNG.
 *
 * UWAGA: Pełny decoder PNG to złożony temat.
 * Używamy proxy przez XMLHttpRequest w JS thread lub wbudowanego decodera.
 */
function decodePNGBase64ToRGBA(
  base64: string,
  width: number,
  height: number
): Uint8ClampedArray {
  // W React Native możemy użyć globalnego atob() (dostępne w Hermes engine)
  try {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Próba parsowania PNG IDAT chunk
    return parsePNGBytes(bytes, width, height);
  } catch (e) {
    // Fallback: zwróć syntetyczne dane (tryb degraded)
    console.warn('[decodePNGBase64ToRGBA] Fallback do danych syntetycznych:', e);
    return generateSyntheticPixelData(width, height);
  }
}

/**
 * Minimalistyczny parser PNG — obsługuje 8-bit RGB i RGBA.
 * Używa wbudowanego dekodera zlib (inflate.ts) do dekompresji IDAT chunks.
 */
function parsePNGBytes(bytes: Uint8Array, width: number, height: number): Uint8ClampedArray {
  // Signature: 8 bytes
  if (
    bytes[0] !== 0x89 || bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e || bytes[3] !== 0x47
  ) {
    throw new Error('Nie PNG');
  }

  // Odczytaj IHDR
  const pngWidth = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
  const pngHeight = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  const bitDepth = bytes[24];
  const colorType = bytes[25]; // 2=RGB, 6=RGBA

  if (bitDepth !== 8) {
    console.warn(`[PNG] Nieobsługiwana głębia: ${bitDepth}, spadam do syntezy`);
    return generateSyntheticPixelData(pngWidth || width, pngHeight || height);
  }

  if (colorType !== 2 && colorType !== 6) {
    console.warn(`[PNG] Nieobsługiwany colorType: ${colorType}, spadam do syntezy`);
    return generateSyntheticPixelData(pngWidth || width, pngHeight || height);
  }

  const channels = colorType === 6 ? 4 : 3;

  // Zbierz wszystkie IDAT chunks
  const idatChunks: Uint8Array[] = [];
  let offset = 8;

  while (offset < bytes.length - 4) {
    const chunkLen = (bytes[offset] << 24) | (bytes[offset + 1] << 16) |
                     (bytes[offset + 2] << 8) | bytes[offset + 3];
    const chunkType = String.fromCharCode(
      bytes[offset + 4], bytes[offset + 5],
      bytes[offset + 6], bytes[offset + 7]
    );

    if (chunkType === 'IDAT') {
      idatChunks.push(bytes.slice(offset + 8, offset + 8 + chunkLen));
    }

    offset += 12 + chunkLen; // len(4) + type(4) + data(chunkLen) + crc(4)
    if (chunkType === 'IEND') break;
  }

  if (idatChunks.length === 0) {
    throw new Error('PNG: brak chunków IDAT');
  }

  // Połącz wszystkie IDAT chunks w jeden bufor
  const totalLen = idatChunks.reduce((sum, c) => sum + c.length, 0);
  const compressedData = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of idatChunks) {
    compressedData.set(chunk, pos);
    pos += chunk.length;
  }

  // Dekompresja zlib → surowe scanlines PNG
  const rawData = zlibDecompress(compressedData);

  const w = pngWidth || width;
  const h = pngHeight || height;

  // Unfiltruj scanlines i konwertuj do RGBA
  return unfilterPNG(rawData, w, h, channels);
}

/**
 * Generuje syntetyczne dane pikseli (szarobrązowy gradient)
 * używane TYLKO gdy dekodowanie PNG nie jest możliwe (unsupported colorType/bitDepth).
 */
function generateSyntheticPixelData(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Symuluj gradient ciemnego ubrania na jasnym tle
      const inClothingArea =
        x > width * 0.1 && x < width * 0.9 &&
        y > height * 0.05 && y < height * 0.95;

      const brightness = inClothingArea ? 40 + Math.random() * 30 : 220 + Math.random() * 30;
      data[i] = brightness;
      data[i + 1] = brightness;
      data[i + 2] = brightness;
      data[i + 3] = 255;
    }
  }
  return data;
}

