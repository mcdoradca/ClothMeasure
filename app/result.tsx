import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Share,
  Platform,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Text as SvgText, Image as SvgImage, Rect, G, Polygon } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { calculateDistanceCm } from '../src/algorithms/measurement';
import { applyHomography } from '../src/algorithms/perspective';
import { SentinelLogger } from '../src/utils/logger';

import { useImageCoordinateSpace } from '../src/hooks/useImageCoordinateSpace';
import { MeasurementPoint } from '../src/components/MeasurementPoint';
import { MeasurementTabs } from '../src/components/MeasurementTabs';
import { CustomMeasurement, Point } from '../src/types';

const { width: SCREEN_W } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_W * 1.33; 

type Behavior = 'symmetry' | 'vertical' | 'free';
type LineId = 'shoulder' | 'chest' | 'waist' | 'length' | 'sleeveOut' | 'sleeveIn' | 'rise' | 'legOut' | 'legIn';

const LINE_DEFS: Record<LineId, { label: string, color: string, p1: string, p2: string, behavior: Behavior, icon: string }> = {
  shoulder: { label: 'Ramiona', color: '#00E5FF', p1: 'sl', p2: 'sr', behavior: 'symmetry', icon: 'body-outline' },
  chest: { label: 'Klatka', color: '#69FF47', p1: 'cl', p2: 'cr', behavior: 'symmetry', icon: 'heart-outline' },
  waist: { label: 'Talia (Pas)', color: '#FF6B6B', p1: 'wl', p2: 'wr', behavior: 'symmetry', icon: 'fitness-outline' },
  length: { label: 'Długość całk.', color: '#C77DFF', p1: 'lt', p2: 'lb', behavior: 'vertical', icon: 'arrow-down-outline' },
  sleeveOut: { label: 'Rękaw zewn.', color: '#FFD700', p1: 'so_t', p2: 'so_b', behavior: 'free', icon: 'analytics-outline' },
  sleeveIn: { label: 'Rękaw wewn.', color: '#FFA500', p1: 'si_t', p2: 'si_b', behavior: 'free', icon: 'analytics-outline' },
  rise: { label: 'Stan (Krocze-Pas)', color: '#00E5FF', p1: 'rise_t', p2: 'rise_b', behavior: 'free', icon: 'arrow-up-outline' },
  legOut: { label: 'Nogawka zewn.', color: '#C77DFF', p1: 'lo_t', p2: 'lo_b', behavior: 'free', icon: 'analytics-outline' },
  legIn: { label: 'Nogawka wewn.', color: '#69FF47', p1: 'li_t', p2: 'li_b', behavior: 'free', icon: 'analytics-outline' },
};

const GARMENT_CONFIG: Record<string, LineId[]> = {
  tshirt: ['shoulder', 'chest', 'waist', 'length', 'sleeveOut', 'sleeveIn'],
  shirt: ['shoulder', 'chest', 'waist', 'length', 'sleeveOut', 'sleeveIn'],
  jacket: ['shoulder', 'chest', 'waist', 'length', 'sleeveOut', 'sleeveIn'],
  pants: ['waist', 'rise', 'legOut', 'legIn'],
  dress: ['shoulder', 'chest', 'waist', 'length'],
  unknown: ['length', 'shoulder', 'chest', 'waist'],
};

const GARMENT_LABELS: Record<string, { emoji: string; name: string }> = {
  tshirt: { emoji: '👕', name: 'T-Shirt' },
  shirt: { emoji: '👔', name: 'Koszula' },
  jacket: { emoji: '🧥', name: 'Kurtka/Marynarka' },
  pants: { emoji: '👖', name: 'Spodnie' },
  dress: { emoji: '👗', name: 'Sukienka' },
  unknown: { emoji: '📏', name: 'Inne' },
};

const getTextPos = (id: LineId | string, p1: Point, p2: Point) => {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  switch (id) {
    case 'shoulder': return { x: mx, y: my - 16, anchor: 'middle' };
    case 'chest': return { x: mx, y: my + 26, anchor: 'middle' };
    case 'waist': return { x: mx, y: my + 26, anchor: 'middle' };
    case 'length': return { x: mx + 16, y: my, anchor: 'start' };
    case 'sleeveOut': return { x: mx, y: my - 20, anchor: 'middle' };
    case 'sleeveIn': return { x: mx, y: my + 26, anchor: 'middle' };
    case 'rise': return { x: mx + 16, y: my, anchor: 'start' };
    case 'legOut': return { x: mx - 16, y: my, anchor: 'end' };
    case 'legIn': return { x: mx + 16, y: my, anchor: 'start' };
    default: return { x: mx, y: my - 12, anchor: 'middle' };
  }
};

const INITIAL_PTS = {
  sl: { x: (1200) * 0.25, y: (1600) * 0.25 }, sr: { x: (1200) * 0.75, y: (1600) * 0.25 },
  cl: { x: (1200) * 0.20, y: (1600) * 0.40 }, cr: { x: (1200) * 0.80, y: (1600) * 0.40 },
  wl: { x: (1200) * 0.22, y: (1600) * 0.65 }, wr: { x: (1200) * 0.78, y: (1600) * 0.65 },
  lt: { x: (1200) * 0.5,  y: (1600) * 0.15 }, lb: { x: (1200) * 0.5,  y: (1600) * 0.85 },
  so_t: { x: (1200) * 0.25, y: (1600) * 0.25 }, so_b: { x: (1200) * 0.1, y: (1600) * 0.5 },
  si_t: { x: (1200) * 0.20, y: (1600) * 0.40 }, si_b: { x: (1200) * 0.15, y: (1600) * 0.45 },
  rise_t: { x: (1200) * 0.5, y: (1600) * 0.15 }, rise_b: { x: (1200) * 0.5, y: (1600) * 0.45 },
  lo_t: { x: (1200) * 0.2, y: (1600) * 0.15 }, lo_b: { x: (1200) * 0.2, y: (1600) * 0.85 },
  li_t: { x: (1200) * 0.4, y: (1600) * 0.45 }, li_b: { x: (1200) * 0.4, y: (1600) * 0.85 },
};

export default function ResultScreen() {
  const currentResult = useMeasurementStore((s) => s.currentResult);
  const addToHistory = useMeasurementStore((s) => s.addToHistory);
  const [saved, setSaved] = useState(false);
  const exportSvgRef = useRef<any>(null);

  type FlowStep = 'garmentSelect' | 'measuring' | 'customMeasuring' | 'summary';
  const [flowStep, setFlowStep] = useState<FlowStep>('garmentSelect');
  const [activeLineId, setActiveLineId] = useState<LineId | null>(null);
  const [customMeasurements, setCustomMeasurements] = useState<CustomMeasurement[]>([]);
  const [cameFromSummary, setCameFromSummary] = useState(false);

  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: SCREEN_W, height: IMAGE_HEIGHT });
  const [pts, setPts] = useState<Record<string, Point>>(INITIAL_PTS);

  const [garmentType, setGarmentType] = useState<keyof typeof GARMENT_CONFIG>('tshirt');
  const [symmetryLocked, setSymmetryLocked] = useState(false);
  const [activePoint, setActivePoint] = useState<Point | null>(null);

  // Zmienne dla trybu custom (dowolnego pomiaru)
  const [customEditId, setCustomEditId] = useState<string | null>(null);
  const [customLabel, setCustomLabel] = useState('Pomiar niestandardowy');
  const [customP1, setCustomP1] = useState<Point>({ x: 600, y: 700 });
  const [customP2, setCustomP2] = useState<Point>({ x: 600, y: 900 });

  if (!currentResult) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>Brak wyników. Wróć i zrób zdjęcie.</Text>
        <TouchableOpacity onPress={() => router.replace('/')}>
          <Text style={styles.emptyLink}>Strona główna</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { imageUri, markerFound, pixelPerCm, homographyMatrix, imageWidth, imageHeight } = currentResult;

  // Jedyne źródło prawdy dla przestrzeni współrzędnych
  const coordSpace = useImageCoordinateSpace(imageWidth || 1200, imageHeight || 1600, containerSize);

  const getTrueDistance = (p1: Point, p2: Point) => {
    if (pixelPerCm <= 0) return 0;
    if (homographyMatrix) {
      const hp1 = applyHomography(p1, homographyMatrix);
      const hp2 = applyHomography(p2, homographyMatrix);
      const dx = hp2.x - hp1.x;
      const dy = hp2.y - hp1.y;
      return Math.sqrt(dx * dx + dy * dy);
    } else {
      return calculateDistanceCm(p1, p2, pixelPerCm);
    }
  };

  const calcCm = (p1Key: string, p2Key: string) => {
    const p1 = pts[p1Key] || { x: 0, y: 0 };
    const p2 = pts[p2Key] || { x: 0, y: 0 };
    const val = getTrueDistance(p1, p2);
    return isNaN(val) ? 0 : Math.round(val * 2) / 2;
  };

  const calcCustomCm = (p1: Point, p2: Point) => {
    const val = getTrueDistance(p1, p2);
    return isNaN(val) ? 0 : Math.round(val * 2) / 2;
  };

  const activeLines = GARMENT_CONFIG[garmentType];
  const measurements = activeLines.map(id => {
    const def = LINE_DEFS[id];
    return { ...def, id, value: calcCm(def.p1, def.p2) };
  });

  const handleMove = (def: typeof LINE_DEFS[LineId], activeKey: string, siblingKey: string, x: number, y: number) => {
    setPts(p => {
      const next = { ...p, [activeKey]: { x, y } };
      if (def.behavior === 'symmetry' && symmetryLocked) {
        next[siblingKey] = { x: (imageWidth || 1200) - x, y };
      } else if (def.behavior === 'vertical') {
        next[siblingKey] = { x, y: p[siblingKey].y };
      }
      return next;
    });
  };

  const handleShare = async () => {
    try {
      SentinelLogger.start('Result', 'handleShare');
      let msgLines = measurements.map(m => `${m.label}: ${m.value.toFixed(1)}cm`).join('\n');
      if (customMeasurements.length > 0) {
        msgLines += '\n' + customMeasurements.map(m => `${m.label}: ${calcCustomCm(m.p1, m.p2).toFixed(1)}cm`).join('\n');
      }
      const msg = `ClothMeasure Wyniki (${GARMENT_LABELS[garmentType].name}):\n${msgLines}`;
      await Share.share({ message: msg, title: 'Wymiary z ClothMeasure' });
      SentinelLogger.success('Result', 'handleShare');
    } catch (e) {
      SentinelLogger.error('Result', 'handleShare', e);
    }
  };

  const generateFilename = () => {
    const d = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `Pomiar_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
  };

  const handleSave = async () => {
    try {
      SentinelLogger.start('Result', 'handleSave');
      if (await Sharing.isAvailableAsync() && exportSvgRef.current) {
        exportSvgRef.current.toDataURL(async (data: string) => {
          try {
            const tempUri = FileSystem.cacheDirectory + generateFilename();
            const base64Data = data.includes(',') ? data.split(',')[1] : data;
            await FileSystem.writeAsStringAsync(tempUri, base64Data, { encoding: 'base64' });
            
            await Sharing.shareAsync(tempUri, { mimeType: 'image/png', dialogTitle: 'Zapisz zdjęcie z miarami' });
            setSaved(true);
            
            addToHistory({
              ...currentResult,
              id: Date.now().toString(),
              timestamp: Date.now(),
              measurements: {
                garmentType: garmentType as any,
                width: calcCm('cl', 'cr'),
                length: calcCm('lt', 'lb'),
                shoulder: calcCm('sl', 'sr'),
                chest: calcCm('cl', 'cr'),
                waist: calcCm('wl', 'wr'),
                lines: [
                  ...measurements.map(m => ({
                    label: m.label,
                    start: pts[m.p1],
                    end: pts[m.p2],
                    color: m.color,
                    valueCm: m.value
                  })),
                  ...customMeasurements.map(m => ({
                    label: m.label,
                    start: m.p1,
                    end: m.p2,
                    color: m.color,
                    valueCm: calcCustomCm(m.p1, m.p2)
                  }))
                ],
                confidence: 1,
              },
            });
            SentinelLogger.success('Result', 'handleSave');
          } catch (err) {
            SentinelLogger.error('Result', 'handleSaveDataUrl', err);
          }
        });
      }
    } catch (e) {
      SentinelLogger.error('Result', 'handleSave', e);
    }
  };

  const startCustomMeasurement = (existing?: CustomMeasurement) => {
    if (existing) {
      setCustomEditId(existing.id);
      setCustomLabel(existing.label);
      setCustomP1(existing.p1);
      setCustomP2(existing.p2);
    } else {
      setCustomEditId(null);
      setCustomLabel('Pomiar niestandardowy');
      setCustomP1({ x: (imageWidth || 1200) / 2, y: (imageHeight || 1600) / 2 - 100 });
      setCustomP2({ x: (imageWidth || 1200) / 2, y: (imageHeight || 1600) / 2 + 100 });
    }
    setFlowStep('customMeasuring');
  };

  const saveCustomMeasurement = () => {
    if (customEditId) {
      setCustomMeasurements(prev => prev.map(m => m.id === customEditId ? { ...m, label: customLabel, p1: customP1, p2: customP2 } : m));
    } else {
      const colors = ['#FF00FF', '#00FF00', '#FFFF00', '#00FFFF', '#FF0000', '#0000FF'];
      const color = colors[customMeasurements.length % colors.length];
      setCustomMeasurements(prev => [...prev, { id: `custom_${Date.now()}`, label: customLabel, p1: customP1, p2: customP2, color }]);
    }
    setFlowStep(cameFromSummary ? 'summary' : 'measuring');
  };

  const renderMagnifier = () => {
    if (!activePoint) return null;
    const magnifierZoom = 2.5;
    const screenPos = coordSpace.imageToScreen(activePoint);
    
    return (
      <View
        style={[
          styles.magnifierWrap,
          {
            left: screenPos.x > SCREEN_W / 2 ? 16 : SCREEN_W - 136,
            top: 16,
          },
        ]}
      >
        <Image
          source={{ uri: imageUri }}
          resizeMode="contain"
          style={[
            styles.magnifierImage,
            {
              transform: [
                { translateX: -screenPos.x * magnifierZoom + 60 },
                { translateY: -screenPos.y * magnifierZoom + 60 },
              ],
            },
          ]}
        />
        <View style={styles.magnifierCrosshair} />
      </View>
    );
  };

  const visualStrokeWidth = 3 * coordSpace.scale;
  const visualFontSize = 19 * coordSpace.scale;
  const visualPointRadius = 12 * coordSpace.scale;

  const renderSVGPolygon = () => {
    if (!currentResult.arucoCorners) return null;
    return (
      <Polygon
        points={currentResult.arucoCorners.map(c => `${c.x},${c.y}`).join(' ')}
        fill="rgba(105, 255, 71, 0.2)"
        stroke="#69FF47"
        strokeWidth={2 * coordSpace.scale}
      />
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A1A', '#0D1B3E', '#0A0A1A']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        {flowStep !== 'garmentSelect' && (
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={() => {
              if (flowStep === 'summary') setFlowStep('measuring');
              else if (flowStep === 'measuring') setFlowStep('garmentSelect');
              else if (flowStep === 'customMeasuring') setFlowStep(cameFromSummary ? 'summary' : 'measuring');
            }}
          >
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
        )}
        {(flowStep === 'garmentSelect') && (
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>
          {flowStep === 'garmentSelect' ? 'Krok 1: Typ Odzieży' : 
           flowStep === 'measuring' ? 'Krok 2: Pomiary' : 
           flowStep === 'customMeasuring' ? 'Dowolny Pomiar' : 'Podsumowanie'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {flowStep === 'garmentSelect' && (
        <ScrollView contentContainerStyle={styles.garmentSelectContainer}>
          <Text style={styles.garmentSelectTitle}>Co dzisiaj mierzymy?</Text>
          <View style={styles.garmentGrid}>
            {Object.keys(GARMENT_CONFIG).map(typeKey => {
              const type = typeKey as keyof typeof GARMENT_CONFIG;
              return (
                <TouchableOpacity
                  key={type}
                  style={styles.garmentCard}
                  onPress={() => {
                    setGarmentType(type);
                    setActiveLineId(GARMENT_CONFIG[type][0]);
                    setCameFromSummary(false);
                    setFlowStep('measuring');
                  }}
                >
                  <Text style={styles.garmentCardEmoji}>{GARMENT_LABELS[type].emoji}</Text>
                  <Text style={styles.garmentCardTitle}>{GARMENT_LABELS[type].name}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </ScrollView>
      )}

      {flowStep === 'measuring' && (
        <View style={{ flex: 1 }}>
          <MeasurementTabs 
            lines={activeLines.map(id => {
              const def = LINE_DEFS[id];
              // Sprawdzamy czy punkty zostały przemieszczone z pozycji startowej
              const isMoved = pts[def.p1].x !== INITIAL_PTS[def.p1 as keyof typeof INITIAL_PTS].x || 
                              pts[def.p1].y !== INITIAL_PTS[def.p1 as keyof typeof INITIAL_PTS].y;
              return { id, label: def.label, color: def.color, isMeasured: isMoved };
            })}
            activeId={activeLineId || ''}
            onSelect={(id) => setActiveLineId(id as LineId)}
            onSelectCustom={() => {
              setCameFromSummary(false);
              startCustomMeasurement();
            }}
          />
          
          <View 
            style={styles.imageContainer}
            onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <Svg 
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${imageWidth || 1200} ${imageHeight || 1600}`}
              preserveAspectRatio="xMidYMid meet"
              style={StyleSheet.absoluteFill}
            >
              <SvgImage 
                href={{ uri: imageUri }} 
                x="0" 
                y="0" 
                width={imageWidth || 1200} 
                height={imageHeight || 1600}
                preserveAspectRatio="xMidYMid meet"
              />
              
              {renderSVGPolygon()}

              {activeLineId && (
                <G>
                  {(() => {
                    const def = LINE_DEFS[activeLineId];
                    const p1 = pts[def.p1];
                    const p2 = pts[def.p2];
                    return (
                      <>
                        <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={def.color} strokeWidth={visualStrokeWidth} strokeDasharray={`${4 * coordSpace.scale} ${4 * coordSpace.scale}`} />
                        <SvgText x={getTextPos(activeLineId, p1, p2).x} y={getTextPos(activeLineId, p1, p2).y} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth={4 * coordSpace.scale} fontSize={visualFontSize} fontWeight="bold" textAnchor={getTextPos(activeLineId, p1, p2).anchor as any}>
                          {`${calcCm(def.p1, def.p2).toFixed(1)} cm`}
                        </SvgText>
                        <SvgText x={getTextPos(activeLineId, p1, p2).x} y={getTextPos(activeLineId, p1, p2).y} fill={def.color} fontSize={visualFontSize} fontWeight="bold" textAnchor={getTextPos(activeLineId, p1, p2).anchor as any}>
                          {`${calcCm(def.p1, def.p2).toFixed(1)} cm`}
                        </SvgText>
                      </>
                    );
                  })()}
                </G>
              )}
            </Svg>

            {activeLineId && (
              <>
                <MeasurementPoint
                  key={LINE_DEFS[activeLineId].p1}
                  id={LINE_DEFS[activeLineId].p1}
                  initialX={pts[LINE_DEFS[activeLineId].p1].x}
                  initialY={pts[LINE_DEFS[activeLineId].p1].y}
                  scale={coordSpace.scale}
                  color={LINE_DEFS[activeLineId].color}
                  onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
                  onMove={(x, y) => handleMove(LINE_DEFS[activeLineId], LINE_DEFS[activeLineId].p1, LINE_DEFS[activeLineId].p2, x, y)}
                />
                <MeasurementPoint
                  key={LINE_DEFS[activeLineId].p2}
                  id={LINE_DEFS[activeLineId].p2}
                  initialX={pts[LINE_DEFS[activeLineId].p2].x}
                  initialY={pts[LINE_DEFS[activeLineId].p2].y}
                  scale={coordSpace.scale}
                  color={LINE_DEFS[activeLineId].color}
                  onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
                  onMove={(x, y) => handleMove(LINE_DEFS[activeLineId], LINE_DEFS[activeLineId].p2, LINE_DEFS[activeLineId].p1, x, y)}
                />
              </>
            )}
            
            {renderMagnifier()}
          </View>
          
          <View style={styles.bottomBar}>
            <View style={styles.badgesRow}>
              <View style={[styles.badge, markerFound ? styles.badgeSuccess : styles.badgeWarning]}>
                <Ionicons name={markerFound ? 'checkmark-circle' : 'warning'} size={14} color={markerFound ? '#69FF47' : '#FFD700'} />
                <Text style={[styles.badgeText, { color: markerFound ? '#69FF47' : '#FFD700' }]}>
                  {markerFound ? 'Skala: ArUco 10cm' : 'Szacowanie'}
                </Text>
              </View>
              {activeLineId && LINE_DEFS[activeLineId].behavior === 'symmetry' && (
                <TouchableOpacity 
                  style={[styles.badge, symmetryLocked && { backgroundColor: '#1E2A3A', borderColor: '#00E5FF' }]}
                  onPress={() => setSymmetryLocked(!symmetryLocked)}
                >
                  <Ionicons name={symmetryLocked ? 'lock-closed' : 'move'} size={14} color={symmetryLocked ? '#00E5FF' : '#8899AA'} />
                  <Text style={[styles.badgeText, symmetryLocked && { color: '#00E5FF' }]}>Złączone krawędzie</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => setFlowStep('summary')}>
              <Text style={styles.primaryBtnText}>Podsumowanie</Text>
              <Ionicons name="arrow-forward" size={20} color="#0A0A1A" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {flowStep === 'customMeasuring' && (
        <View style={{ flex: 1 }}>
          <View style={styles.customHeader}>
            <TextInput 
              style={styles.customInput}
              value={customLabel}
              onChangeText={setCustomLabel}
              placeholder="Nazwa pomiaru"
              placeholderTextColor="#8899AA"
            />
          </View>
          <View 
            style={styles.imageContainer}
            onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <Svg 
              width="100%" 
              height="100%" 
              viewBox={`0 0 ${imageWidth || 1200} ${imageHeight || 1600}`}
              preserveAspectRatio="xMidYMid meet"
              style={StyleSheet.absoluteFill}
            >
              <SvgImage 
                href={{ uri: imageUri }} 
                x="0" 
                y="0" 
                width={imageWidth || 1200} 
                height={imageHeight || 1600}
                preserveAspectRatio="xMidYMid meet"
              />
              {renderSVGPolygon()}
              
              <G>
                <Line x1={customP1.x} y1={customP1.y} x2={customP2.x} y2={customP2.y} stroke="#FF00FF" strokeWidth={visualStrokeWidth} strokeDasharray={`${4 * coordSpace.scale} ${4 * coordSpace.scale}`} />
                <SvgText x={getTextPos('custom', customP1, customP2).x} y={getTextPos('custom', customP1, customP2).y} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth={4 * coordSpace.scale} fontSize={visualFontSize} fontWeight="bold" textAnchor="middle">
                  {`${calcCustomCm(customP1, customP2).toFixed(1)} cm`}
                </SvgText>
                <SvgText x={getTextPos('custom', customP1, customP2).x} y={getTextPos('custom', customP1, customP2).y} fill="#FF00FF" fontSize={visualFontSize} fontWeight="bold" textAnchor="middle">
                  {`${calcCustomCm(customP1, customP2).toFixed(1)} cm`}
                </SvgText>
              </G>
            </Svg>

            <MeasurementPoint
              id="custom1"
              initialX={customP1.x}
              initialY={customP1.y}
              scale={coordSpace.scale}
              color="#FF00FF"
              onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
              onMove={(x, y) => setCustomP1({ x, y })}
            />
            <MeasurementPoint
              id="custom2"
              initialX={customP2.x}
              initialY={customP2.y}
              scale={coordSpace.scale}
              color="#FF00FF"
              onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
              onMove={(x, y) => setCustomP2({ x, y })}
            />
            
            {renderMagnifier()}
          </View>
          
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.primaryBtn} onPress={saveCustomMeasurement}>
              <Ionicons name="save-outline" size={20} color="#0A0A1A" />
              <Text style={styles.primaryBtnText}>Zapisz pomiar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {flowStep === 'summary' && (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 10 }}>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: 'white' }}>Gotowe!</Text>
            <Text style={{ color: '#8899AA', marginTop: 4 }}>Sprawdź podsumowanie pomiarów ({GARMENT_LABELS[garmentType].name}).</Text>
          </View>

          <View style={styles.measurementsTable}>
            {measurements.map(m => (
              <TouchableOpacity key={m.id} onPress={() => { setActiveLineId(m.id as LineId); setFlowStep('measuring'); }}>
                <MeasurementRow label={m.label} value={m.value} color={m.color} icon={m.icon} />
              </TouchableOpacity>
            ))}
            {customMeasurements.map(m => (
              <TouchableOpacity key={m.id} onPress={() => { setCameFromSummary(true); startCustomMeasurement(m); }}>
                <MeasurementRow label={m.label} value={calcCustomCm(m.p1, m.p2)} color={m.color} icon="color-wand-outline" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.addCustomBtn} onPress={() => { setCameFromSummary(true); startCustomMeasurement(); }}>
              <Ionicons name="add" size={20} color="#00E5FF" />
              <Text style={styles.addCustomText}>Dodaj kolejny pomiar</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={handleShare}>
              <Ionicons name="share-outline" size={20} color="white" />
              <Text style={styles.actionBtnText}>Udostępnij</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary, saved && styles.actionBtnSaved]} onPress={handleSave} disabled={saved}>
              <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color={saved ? '#0A0A1A' : '#0A0A1A'} />
              <Text style={[styles.actionBtnText, { color: saved ? '#0A0A1A' : '#0A0A1A' }]}>{saved ? 'Zapisano' : 'Zapisz zdjęcie'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* OFF-SCREEN SVG DLA EKSPORTU Z DOKLEJONĄ TABELKĄ (RENDEROWANE ZAWSZE) */}
      <View style={{ position: 'absolute', top: -9999, left: -9999, zIndex: -10, opacity: 0 }}>
          <Svg 
            ref={exportSvgRef} 
            width={imageWidth || 1200} 
            height={(imageHeight || 1600) + 70 + (measurements.length + customMeasurements.length) * 36}
            viewBox={`0 0 ${imageWidth || 1200} ${(imageHeight || 1600) + 70 + (measurements.length + customMeasurements.length) * 36}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute' }}
          >
            <Rect x="0" y="0" width={imageWidth || 1200} height={(imageHeight || 1600) + 70 + (measurements.length + customMeasurements.length) * 36} fill="#111828" />
            
            <SvgImage 
              href={{ uri: imageUri }} 
              x="0" 
              y="0"
              width={imageWidth || 1200} 
              height={imageHeight || 1600}
              preserveAspectRatio="xMidYMid meet"
            />
            
            {currentResult.arucoCorners && (
              <Polygon
                points={currentResult.arucoCorners.map(c => `${c.x},${c.y}`).join(' ')}
                fill="rgba(105, 255, 71, 0.2)"
                stroke="#69FF47"
                strokeWidth="2"
              />
            )}

            {[...measurements.map(m => ({ ...m, p1: pts[m.p1 as string], p2: pts[m.p2 as string] })), 
              ...customMeasurements].map(m => (
              <G key={`exp_${m.id}`}>
                <Line x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke={m.color} strokeWidth="3" strokeDasharray="4 4" />
                <SvgText x={getTextPos(m.id, m.p1, m.p2).x} y={getTextPos(m.id, m.p1, m.p2).y} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth="4" fontSize="19" fontWeight="bold" textAnchor={getTextPos(m.id, m.p1, m.p2).anchor as any}>
                  {`${(m as any).value !== undefined ? (m as any).value.toFixed(1) : calcCustomCm(m.p1, m.p2).toFixed(1)} cm`}
                </SvgText>
                <SvgText x={getTextPos(m.id, m.p1, m.p2).x} y={getTextPos(m.id, m.p1, m.p2).y} fill={m.color} fontSize="19" fontWeight="bold" textAnchor={getTextPos(m.id, m.p1, m.p2).anchor as any}>
                  {`${(m as any).value !== undefined ? (m as any).value.toFixed(1) : calcCustomCm(m.p1, m.p2).toFixed(1)} cm`}
                </SvgText>
                <Circle cx={m.p1.x} cy={m.p1.y} r="12" fill={m.color} fillOpacity="0.2" stroke={m.color} strokeWidth="2" />
                <Circle cx={m.p2.x} cy={m.p2.y} r="12" fill={m.color} fillOpacity="0.2" stroke={m.color} strokeWidth="2" />
              </G>
            ))}

            <SvgText x="16" y={(imageHeight || 1600) + 30} fill="#FFFFFF" fontSize="20" fontWeight="bold">Podsumowanie Pomiarów</SvgText>
            
            {[...measurements, ...customMeasurements.map(cm => ({ ...cm, value: calcCustomCm(cm.p1, cm.p2) }))].map((m, idx) => (
              <G key={`tbl_${m.id}`}>
                <Circle cx="24" cy={(imageHeight || 1600) + 56 + idx * 36} r="6" fill={m.color} />
                <SvgText x="40" y={(imageHeight || 1600) + 62 + idx * 36} fill="#CCDDEE" fontSize="16" fontWeight="bold">{m.label}</SvgText>
                <SvgText x={(imageWidth || 1200) - 40} y={(imageHeight || 1600) + 62 + idx * 36} fill={m.color} fontSize="18" fontWeight="bold" textAnchor="end">{`${m.value.toFixed(1)} cm`}</SvgText>
              </G>
            ))}
          </Svg>
        </View>
    </View>
  );
}

function MeasurementRow({ label, value, color, icon }: { label: string; value: number; color: string; icon: string }) {
  return (
    <View style={styles.measurementRow}>
      <View style={[styles.measurementIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
      <Text style={styles.measurementLabel}>{label}</Text>
      <Text style={[styles.measurementValue, { color }]}>{`${value.toFixed(1)} cm`}</Text>
      <Ionicons name="chevron-forward" size={16} color="#4A5A7A" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A' },
  emptyContainer: { flex: 1, backgroundColor: '#0A0A1A', alignItems: 'center', justifyContent: 'center', gap: 16 },
  emptyText: { fontSize: 16, color: '#8899AA' },
  emptyLink: { fontSize: 16, color: '#00E5FF', fontWeight: '600' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 55 : 40, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: 'rgba(10,10,26,0.95)', borderBottomWidth: 1, borderBottomColor: '#1E2A3A',
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: 'white' },
  scroll: { paddingBottom: 40 },
  imageContainer: { width: SCREEN_W, height: IMAGE_HEIGHT, backgroundColor: '#050510', position: 'relative' },
  
  magnifierWrap: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: '#000', borderWidth: 2, borderColor: '#00E5FF',
    overflow: 'hidden', elevation: 10, zIndex: 100,
  },
  magnifierImage: {
    position: 'absolute',
    width: SCREEN_W * 2.5,
    height: IMAGE_HEIGHT * 2.5,
  },
  magnifierCrosshair: {
    position: 'absolute', left: 55, top: 55, width: 10, height: 10,
    borderRadius: 5, backgroundColor: 'transparent',
    borderWidth: 1, borderColor: '#FF00FF',
  },

  badgesRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#111828', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#1E2A3A',
  },
  badgeSuccess: { borderColor: '#69FF4730' },
  badgeWarning: { borderColor: '#FFD70030' },
  badgeText: { fontSize: 12, color: '#8899AA', fontWeight: '500' },
  
  measurementsTable: {
    marginHorizontal: 16, backgroundColor: '#111828', borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1E2A3A', marginBottom: 24,
  },
  measurementRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: '#1A2030' },
  measurementIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  measurementLabel: { flex: 1, fontSize: 15, color: '#CCDDEE', fontWeight: '500' },
  measurementValue: { fontSize: 18, fontWeight: '800' },
  
  addCustomBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderTopWidth: 1, borderTopColor: '#1A2030', backgroundColor: '#161F33' },
  addCustomText: { color: '#00E5FF', fontWeight: 'bold' },

  actionsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14 },
  actionBtnPrimary: { backgroundColor: '#00E5FF' },
  actionBtnSecondary: { backgroundColor: '#1E2A3A' },
  actionBtnSaved: { backgroundColor: '#1E2A3A' },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },

  garmentSelectContainer: { paddingHorizontal: 16, paddingTop: 30, paddingBottom: 60 },
  garmentSelectTitle: { fontSize: 28, color: 'white', fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  garmentGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16 },
  garmentCard: { width: '47%', backgroundColor: '#111828', borderRadius: 16, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#1E2A3A' },
  garmentCardEmoji: { fontSize: 48, marginBottom: 12 },
  garmentCardTitle: { color: 'white', fontSize: 16, fontWeight: '600' },

  bottomBar: { paddingBottom: 30, backgroundColor: '#0A0A1A' },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#00E5FF', marginHorizontal: 16, paddingVertical: 16, borderRadius: 14 },
  primaryBtnText: { color: '#0A0A1A', fontSize: 16, fontWeight: 'bold' },

  customHeader: { padding: 16, backgroundColor: '#111828', borderBottomWidth: 1, borderBottomColor: '#1E2A3A' },
  customInput: { backgroundColor: '#1E2A3A', color: 'white', padding: 12, borderRadius: 8, fontSize: 16, fontWeight: '500' },
});
