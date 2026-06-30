import { getPerspectiveTransform, applyHomography } from '../src/algorithms/perspective';
import { calculateDistanceCm } from '../src/algorithms/measurement';

// ============================================================
// KONTRAKT GEOMETRYCZNY — patrz docs/adr/0010-coordinate-space-contract.md
// Te testy weryfikują punkty 1-3 z sekcji "Twarda zasada" tego ADR.
// Jeśli dowolny z tych testów zacznie failować po zmianie w result.tsx
// lub src/algorithms/*, oznacza to że ktoś złamał kontrakt jednej
// przestrzeni współrzędnych. NIE napraw testu żeby przeszedł —
// napraw kod produkcyjny zgodnie z ADR 0010.
// ============================================================

describe('Kontrakt przestrzeni współrzędnych — marker referencyjny 10x10cm', () => {
  // Symulujemy idealny, niezniekształcony marker ArUco 10x10cm
  // sfotografowany prostopadle z góry, którego 4 rogi w przestrzeni
  // OBRAZU (nie ekranu) wynoszą dokładnie 100px na bok.
  // Oczekiwana skala: 10px/cm.
  const idealMarkerCorners = [
    { x: 1000, y: 1000 }, // TL
    { x: 1100, y: 1000 }, // TR
    { x: 1100, y: 1100 }, // BR
    { x: 1000, y: 1100 }, // BL
  ];
  const MARKER_SIZE_CM = 10;

  const dst = [
    { x: 0, y: 0 },
    { x: MARKER_SIZE_CM, y: 0 },
    { x: MARKER_SIZE_CM, y: MARKER_SIZE_CM },
    { x: 0, y: MARKER_SIZE_CM },
  ];

  test('homografia poprawnie mapuje róg markera na (0,0) w przestrzeni cm', () => {
    const h = getPerspectiveTransform(idealMarkerCorners, dst);
    expect(h).not.toBeNull();
    const mapped = applyHomography(idealMarkerCorners[0], h!);
    expect(mapped.x).toBeCloseTo(0, 1);
    expect(mapped.y).toBeCloseTo(0, 1);
  });

  test('homografia poprawnie mapuje przeciwległy róg markera na (10,10) w przestrzeni cm', () => {
    const h = getPerspectiveTransform(idealMarkerCorners, dst);
    const mapped = applyHomography(idealMarkerCorners[2], h!);
    expect(mapped.x).toBeCloseTo(10, 1);
    expect(mapped.y).toBeCloseTo(10, 1);
  });

  test('dystans między dwoma punktami w przestrzeni obrazu, po homografii, daje poprawne cm — przypadek bez zniekształcenia perspektywy', () => {
    const h = getPerspectiveTransform(idealMarkerCorners, dst);
    // Dwa punkty oddalone o dokładnie 50px w przestrzeni obrazu (5cm przy skali 10px/cm),
    // leżące na tej samej płaszczyźnie co marker (zenitalne zdjęcie, brak skosu)
    const p1 = { x: 1000, y: 1000 };
    const p2 = { x: 1050, y: 1000 };
    const hp1 = applyHomography(p1, h!);
    const hp2 = applyHomography(p2, h!);
    const dx = hp2.x - hp1.x;
    const dy = hp2.y - hp1.y;
    const distanceCm = Math.sqrt(dx * dx + dy * dy);
    expect(distanceCm).toBeCloseTo(5, 1);
  });

  test('calculateDistanceCm (fallback bez homografii) — pixelPerCm 10, dystans 100px = 10cm', () => {
    const p1 = { x: 0, y: 0 };
    const p2 = { x: 100, y: 0 };
    const result = calculateDistanceCm(p1, p2, 10);
    expect(result).toBeCloseTo(10, 1);
  });

  test('REGRESJA — symulacja bugu SCREEN_W vs imageWidth w symetrii lustrzanej', () => {
    // Ten test odtwarza dokładnie błąd znaleziony 2026-06-29 w handleMove:
    // next[siblingKey] = { x: SCREEN_W - x, y } zamiast { x: imageWidth - x, y }.
    // Jeśli imageWidth != SCREEN_W (co jest normą — obraz ma realne wymiary
    // np. 1200px, ekran ma 360px), użycie złej stałej przesuwa punkt
    // lustrzany o wielkość różnicy między tymi przestrzeniami.
    const SCREEN_W = 360;
    const imageWidth = 1200;
    const x = 300; // punkt w przestrzeni obrazu

    const buggyMirror = SCREEN_W - x; // = 60 — BŁĘDNE, miesza przestrzenie
    const correctMirror = imageWidth - x; // = 900 — POPRAWNE

    expect(correctMirror).not.toBe(buggyMirror);
    expect(correctMirror).toBe(900);
    // Ten test nie wywołuje kodu produkcyjnego (handleMove jest zagrzebane
    // w komponencie React, trudne do testowania jednostkowo bez renderowania
    // całego ekranu) — dokumentuje WZÓR błędu, żeby każdy przyszły agent
    // czytający ten plik testowy rozpoznał ten konkretny pattern jeśli
    // natrafi na niego ponownie w innym miejscu kodu.
  });
});

describe('Kontrakt przestrzeni współrzędnych — zniekształcona perspektywa (skos kamery)', () => {
  // Marker sfotografowany pod kątem — boki nie są już idealnym kwadratem
  // w przestrzeni obrazu, ale homografia powinna i tak zrektyfikować
  // pomiar do poprawnych cm.
  const skewedMarkerCorners = [
    { x: 980, y: 1010 },  // TL - lekko przesunięty
    { x: 1105, y: 990 },  // TR
    { x: 1095, y: 1115 }, // BR
    { x: 990, y: 1100 },  // BL
  ];
  const MARKER_SIZE_CM = 10;
  const dst = [
    { x: 0, y: 0 },
    { x: MARKER_SIZE_CM, y: 0 },
    { x: MARKER_SIZE_CM, y: MARKER_SIZE_CM },
    { x: 0, y: MARKER_SIZE_CM },
  ];

  test('homografia dla skośnego markera nadal mapuje wszystkie 4 rogi na idealny kwadrat 10x10', () => {
    const h = getPerspectiveTransform(skewedMarkerCorners, dst);
    expect(h).not.toBeNull();

    const mappedCorners = skewedMarkerCorners.map(c => applyHomography(c, h!));

    expect(mappedCorners[0].x).toBeCloseTo(0, 0);
    expect(mappedCorners[0].y).toBeCloseTo(0, 0);
    expect(mappedCorners[1].x).toBeCloseTo(10, 0);
    expect(mappedCorners[1].y).toBeCloseTo(0, 0);
    expect(mappedCorners[2].x).toBeCloseTo(10, 0);
    expect(mappedCorners[2].y).toBeCloseTo(10, 0);
    expect(mappedCorners[3].x).toBeCloseTo(0, 0);
    expect(mappedCorners[3].y).toBeCloseTo(10, 0);
  });
});

describe('Kontrakt przestrzeni współrzędnych — przypadki brzegowe', () => {
  test('getPerspectiveTransform zwraca null dla niepoprawnej liczby punktów (nie 4)', () => {
    const result = getPerspectiveTransform(
      [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      [{ x: 0, y: 0 }, { x: 1, y: 1 }]
    );
    expect(result).toBeNull();
  });

  test('calculateDistanceCm zwraca 0 dla pixelPerCm <= 0 (zabezpieczenie przed dzieleniem przez zero / NaN)', () => {
    const result = calculateDistanceCm({ x: 0, y: 0 }, { x: 100, y: 100 }, 0);
    expect(result).toBe(0);
  });

  test('calculateDistanceCm dla identycznych punktów zwraca 0', () => {
    const p = { x: 500, y: 500 };
    const result = calculateDistanceCm(p, p, 10);
    expect(result).toBe(0);
  });
});
