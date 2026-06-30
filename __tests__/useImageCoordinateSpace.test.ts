import { computeCoordinateSpace } from '../src/hooks/useImageCoordinateSpace';

describe('computeCoordinateSpace — kontrakt z ADR 0013/0014', () => {
  test('obraz szerszy niż kontener (letterbox pionowy)', () => {
    const cs = computeCoordinateSpace(1200, 800, 360, 360);
    expect(cs.renderedWidth).toBeCloseTo(360, 1);
    expect(cs.offsetX).toBeCloseTo(0, 1);
    expect(cs.offsetY).toBeGreaterThan(0);
  });

  test('obraz węższy niż kontener (letterbox poziomy)', () => {
    const cs = computeCoordinateSpace(800, 1600, 360, 478);
    expect(cs.offsetY).toBeCloseTo(0, 1);
    expect(cs.offsetX).toBeGreaterThan(0);
  });

  test('imageToScreen i screenToImage są wzajemnie odwrotne', () => {
    const cs = computeCoordinateSpace(1200, 1360, 360, 478);
    const originalImagePoint = { x: 600, y: 700 };
    const screenPoint = cs.imageToScreen(originalImagePoint);
    const roundTrip = cs.screenToImage(screenPoint);
    expect(roundTrip.x).toBeCloseTo(originalImagePoint.x, 1);
    expect(roundTrip.y).toBeCloseTo(originalImagePoint.y, 1);
  });

  test('REGRESJA — odtworzenie warunków z bugu 2026-06-30 (zdjęcie 1200x1360, kontener 360x478)', () => {
    // Te dokładne wymiary spowodowały błędną hit-area i czarny ekran lupy
    // przed wprowadzeniem scentralizowanego hooka.
    const cs = computeCoordinateSpace(1200, 1360, 360, 478);
    expect(cs.scale).toBeGreaterThan(0);
    expect(Number.isFinite(cs.scale)).toBe(true);
    expect(Number.isNaN(cs.scale)).toBe(false);
    // punkt w rogu obrazu musi mapować się na sensowny punkt ekranu, nie poza kontener
    const corner = cs.imageToScreen({ x: 0, y: 0 });
    expect(corner.x).toBeGreaterThanOrEqual(-1);
    expect(corner.y).toBeGreaterThanOrEqual(-1);
  });

  test('fallback dla zerowych wymiarów nie crashuje (dzielenie przez zero)', () => {
    const cs = computeCoordinateSpace(0, 0, 0, 0);
    expect(Number.isFinite(cs.scale)).toBe(true);
  });
});
