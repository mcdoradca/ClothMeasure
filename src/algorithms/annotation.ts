// =========================================
// Annotation Renderer
// Rysuje linie pomiarowe i etykiety na zdjęciu
// Używa SVG overlay zapisywanego do pliku
// =========================================

import * as FileSystem from 'expo-file-system';
import { ArucoMarker, GarmentMeasurements, MeasurementLine } from '../types';

/**
 * Renderuje adnotacje pomiarowe na zdjęciu.
 * Strategia: generuje SVG overlay, a następnie łączy z obrazem.
 *
 * W React Native bez natywnego canvas, zwracamy SVG jako string
 * do wyświetlenia jako <SvgXml> overlay na <Image>.
 */
export async function renderAnnotations(
  imageUri: string,
  imageWidth: number,
  imageHeight: number,
  measurements: GarmentMeasurements,
  marker: ArucoMarker | null
): Promise<string> {
  // Generujemy SVG overlay string (zwracamy jako base64 data URI)
  const svg = buildSVGOverlay(imageWidth, imageHeight, measurements, marker);
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Buduje kompletny SVG z liniami pomiarowymi, strzałkami i etykietami.
 */
export function buildSVGOverlay(
  width: number,
  height: number,
  measurements: GarmentMeasurements,
  marker: ArucoMarker | null
): string {
  const lines = measurements.lines.map(line => renderMeasurementLine(line, width, height));
  const markerHighlight = marker ? renderMarkerHighlight(marker) : '';
  const garmentLabel = renderGarmentTypeLabel(measurements.garmentType, width);
  const confidenceBadge = renderConfidenceBadge(measurements.confidence, width, height);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="1" stdDeviation="2" flood-color="rgba(0,0,0,0.8)"/>
    </filter>
    <marker id="arrow-start" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
      <path d="M8,0 L0,4 L8,8" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </marker>
    <marker id="arrow-end" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
      <path d="M0,0 L8,4 L0,8" fill="none" stroke="currentColor" stroke-width="1.5"/>
    </marker>
  </defs>

  <!-- Semi-transparent background strip for garment label -->
  ${garmentLabel}

  <!-- Marker highlight -->
  ${markerHighlight}

  <!-- Measurement lines -->
  ${lines.join('\n  ')}

  <!-- Confidence badge -->
  ${confidenceBadge}
</svg>`;
}

function renderMeasurementLine(line: MeasurementLine, imgWidth: number, imgHeight: number): string {
  const { start, end, valueCm, label, color } = line;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  // Tekst prostopadły do linii
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const textAngle = Math.abs(angle) > 90 ? angle + 180 : angle;

  // Krótkie prostopadłe zakończenia (serifs)
  const perpLen = 8;
  const perpX = (-dy / length) * perpLen;
  const perpY = (dx / length) * perpLen;

  const labelText = `${label}: ${valueCm} cm`;
  const fontSize = Math.max(11, Math.min(16, imgWidth / 60));

  // Tło etykiety
  const textBgWidth = labelText.length * fontSize * 0.6 + 10;
  const textBgHeight = fontSize + 8;

  return `
  <!-- Measurement: ${label} -->
  <g>
    <!-- Main line -->
    <line
      x1="${start.x}" y1="${start.y}"
      x2="${end.x}" y2="${end.y}"
      stroke="${color}"
      stroke-width="2.5"
      stroke-linecap="round"
      filter="url(#shadow)"
    />

    <!-- Start serif -->
    <line
      x1="${start.x + perpX}" y1="${start.y + perpY}"
      x2="${start.x - perpX}" y2="${start.y - perpY}"
      stroke="${color}" stroke-width="2" stroke-linecap="round"
    />

    <!-- End serif -->
    <line
      x1="${end.x + perpX}" y1="${end.y + perpY}"
      x2="${end.x - perpX}" y2="${end.y - perpY}"
      stroke="${color}" stroke-width="2" stroke-linecap="round"
    />

    <!-- Label background -->
    <rect
      x="${midX - textBgWidth / 2}"
      y="${midY - textBgHeight / 2}"
      width="${textBgWidth}"
      height="${textBgHeight}"
      rx="5" ry="5"
      fill="rgba(0,0,0,0.75)"
      transform="rotate(${textAngle}, ${midX}, ${midY})"
    />

    <!-- Label text -->
    <text
      x="${midX}"
      y="${midY + fontSize * 0.35}"
      text-anchor="middle"
      font-family="'SF Pro Display', 'Roboto', Arial, sans-serif"
      font-size="${fontSize}"
      font-weight="700"
      fill="${color}"
      filter="url(#shadow)"
      transform="rotate(${textAngle}, ${midX}, ${midY})"
    >${labelText}</text>
  </g>`;
}

function renderMarkerHighlight(marker: ArucoMarker): string {
  const [tl, tr, br, bl] = marker.corners;
  const points = `${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}`;

  return `
  <!-- ArUco Marker -->
  <g>
    <polygon
      points="${points}"
      fill="none"
      stroke="#00E5FF"
      stroke-width="2"
      stroke-dasharray="4,4"
      opacity="0.8"
    />
    <text
      x="${tl.x}"
      y="${tl.y - 6}"
      font-family="'SF Pro Display', 'Roboto', Arial, sans-serif"
      font-size="11"
      fill="#00E5FF"
      font-weight="600"
    >Marker 10cm</text>
  </g>`;
}

function renderGarmentTypeLabel(garmentType: string, width: number): string {
  const labels: Record<string, string> = {
    shirt: '👔 Koszula',
    tshirt: '👕 T-Shirt',
    pants: '👖 Spodnie',
    dress: '👗 Sukienka',
    jacket: '🧥 Kurtka',
    shorts: '🩳 Szorty',
    skirt: '👗 Spódnica',
    unknown: '👕 Ubranie',
  };

  const label = labels[garmentType] || labels.unknown;
  const fontSize = 16;
  const bgWidth = label.length * fontSize * 0.65 + 20;

  return `
  <!-- Garment type label -->
  <rect x="10" y="10" width="${bgWidth}" height="34" rx="8" fill="rgba(10,10,26,0.85)"/>
  <text
    x="${10 + bgWidth / 2}"
    y="32"
    text-anchor="middle"
    font-family="'SF Pro Display', 'Roboto', Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="white"
  >${label}</text>`;
}

function renderConfidenceBadge(confidence: number, width: number, height: number): string {
  const pct = Math.round(confidence * 100);
  const color = pct >= 90 ? '#69FF47' : pct >= 70 ? '#FFD700' : '#FF6B6B';
  const label = `Precyzja: ${pct}%`;
  const bgWidth = label.length * 11 + 20;
  const x = width - bgWidth - 10;
  const y = 10;

  return `
  <!-- Confidence badge -->
  <rect x="${x}" y="${y}" width="${bgWidth}" height="34" rx="8" fill="rgba(10,10,26,0.85)"/>
  <text
    x="${x + bgWidth / 2}"
    y="${y + 22}"
    text-anchor="middle"
    font-family="'SF Pro Display', 'Roboto', Arial, sans-serif"
    font-size="13"
    font-weight="700"
    fill="${color}"
  >${label}</text>`;
}

/**
 * Nazwa ikony dla danego typu ubrania (@expo/vector-icons)
 */
export function getGarmentIcon(type: string): string {
  const icons: Record<string, string> = {
    shirt: 'shirt-outline',
    tshirt: 'shirt-outline',
    pants: 'shirt-outline',
    dress: 'shirt-outline',
    jacket: 'shirt-outline',
    shorts: 'shirt-outline',
    skirt: 'shirt-outline',
    unknown: 'help-circle-outline',
  };
  return icons[type] || 'shirt-outline';
}

/**
 * Polska nazwa typu ubrania
 */
export function getGarmentName(type: string): string {
  const names: Record<string, string> = {
    shirt: 'Koszula',
    tshirt: 'T-Shirt',
    pants: 'Spodnie',
    dress: 'Sukienka',
    jacket: 'Kurtka',
    shorts: 'Szorty',
    skirt: 'Spódnica',
    unknown: 'Ubranie',
  };
  return names[type] || 'Ubranie';
}
