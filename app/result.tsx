import React, { useRef, useEffect, useState } from 'react';
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
  PanResponder,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Circle, Text as SvgText, Image as SvgImage, Rect, G } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { calculateDistanceCm } from '../src/algorithms/measurement';
import { applyHomography } from '../src/algorithms/perspective';
import { SentinelLogger } from '../src/utils/logger';

const { width: SCREEN_W } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_W * 1.33; // Proporcja domyślnego zdjęcia 4:3

// KONFIGURACJA ZACHOWAŃ PUNKTÓW
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

const getTextPos = (id: LineId, p1: {x:number, y:number}, p2: {x:number, y:number}) => {
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

const GARMENT_CONFIG: Record<string, LineId[]> = {
  tshirt: ['shoulder', 'chest', 'waist', 'length', 'sleeveOut', 'sleeveIn'],
  shirt: ['shoulder', 'chest', 'waist', 'length', 'sleeveOut', 'sleeveIn'],
  jacket: ['shoulder', 'chest', 'waist', 'length', 'sleeveOut', 'sleeveIn'],
  pants: ['waist', 'rise', 'legOut', 'legIn'],
  dress: ['shoulder', 'chest', 'waist', 'length'],
  unknown: ['length', 'shoulder', 'chest', 'waist'],
};

function DraggablePoint({
  id,
  initialX,
  initialY,
  onMove,
  onActive,
}: {
  id: string;
  initialX: number;
  initialY: number;
  onMove: (x: number, y: number) => void;
  onActive: (active: boolean, x: number, y: number) => void;
}) {
  const startPos = useRef({ x: initialX, y: initialY });
  const currPos = useRef({ x: initialX, y: initialY });
  currPos.current = { x: initialX, y: initialY };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startPos.current = { x: currPos.current.x, y: currPos.current.y };
        onActive(true, currPos.current.x, currPos.current.y);
      },
      onPanResponderMove: (e, gesture) => {
        const newX = startPos.current.x + gesture.dx;
        const newY = startPos.current.y + gesture.dy;
        onActive(true, newX, newY);
        onMove(newX, newY);
      },
      onPanResponderRelease: (e, gesture) => {
        const newX = startPos.current.x + gesture.dx;
        const newY = startPos.current.y + gesture.dy;
        onActive(false, newX, newY);
        onMove(newX, newY);
      },
    })
  ).current;

  return (
    <View
      {...panResponder.panHandlers}
      style={[
        styles.draggablePoint,
        {
          left: initialX,
          top: initialY,
          backgroundColor: 'transparent',
          borderWidth: 0,
        },
      ]}
    />
  );
}

export default function ResultScreen() {
  const currentResult = useMeasurementStore((s) => s.currentResult);
  const addToHistory = useMeasurementStore((s) => s.addToHistory);
  const [saved, setSaved] = useState(false);
  const exportSvgRef = useRef<any>(null);

  // Wymiary bazowe
  const W = SCREEN_W;
  const H = IMAGE_HEIGHT;

  const [pts, setPts] = useState<Record<string, { x: number; y: number }>>({
    sl: { x: W * 0.25, y: H * 0.25 }, sr: { x: W * 0.75, y: H * 0.25 },
    cl: { x: W * 0.20, y: H * 0.40 }, cr: { x: W * 0.80, y: H * 0.40 },
    wl: { x: W * 0.22, y: H * 0.65 }, wr: { x: W * 0.78, y: H * 0.65 },
    lt: { x: W * 0.5, y: H * 0.15 }, lb: { x: W * 0.5, y: H * 0.85 },
    so_t: { x: W * 0.25, y: H * 0.25 }, so_b: { x: W * 0.1, y: H * 0.5 },
    si_t: { x: W * 0.20, y: H * 0.40 }, si_b: { x: W * 0.15, y: H * 0.45 },
    rise_t: { x: W * 0.5, y: H * 0.15 }, rise_b: { x: W * 0.5, y: H * 0.45 },
    lo_t: { x: W * 0.2, y: H * 0.15 }, lo_b: { x: W * 0.2, y: H * 0.85 },
    li_t: { x: W * 0.4, y: H * 0.45 }, li_b: { x: W * 0.4, y: H * 0.85 },
  });

  const [garmentType, setGarmentType] = useState<keyof typeof GARMENT_CONFIG>('tshirt');
  const [symmetryLocked, setSymmetryLocked] = useState(false);

  const [imageLayoutSize, setImageLayoutSize] = useState<{ width: number; height: number } | null>(null);
  const [activePoint, setActivePoint] = useState<{ x: number; y: number } | null>(null);

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

  const getTrueDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const imgW = imageWidth || 1200;
    const imgH = imageHeight || 1600;

    if (pixelPerCm <= 0) return 0;

    const viewW = imageLayoutSize?.width ?? SCREEN_W;
    const viewH = imageLayoutSize?.height ?? IMAGE_HEIGHT;
    const imgAspect = imgW / imgH;
    const viewAspect = viewW / viewH;

    let renderedW, renderedH, offsetX = 0, offsetY = 0;

    if (imgAspect > viewAspect) {
      renderedW = viewW;
      renderedH = viewW / imgAspect;
      offsetY = (viewH - renderedH) / 2;
    } else {
      renderedH = viewH;
      renderedW = viewH * imgAspect;
      offsetX = (viewW - renderedW) / 2;
    }

    const scaleToOriginal = imgW / renderedW;
    const trueP1 = { x: (p1.x - offsetX) * scaleToOriginal, y: (p1.y - offsetY) * scaleToOriginal };
    const trueP2 = { x: (p2.x - offsetX) * scaleToOriginal, y: (p2.y - offsetY) * scaleToOriginal };

    if (homographyMatrix) {
      const hp1 = applyHomography(trueP1, homographyMatrix);
      const hp2 = applyHomography(trueP2, homographyMatrix);
      const dx = hp2.x - hp1.x;
      const dy = hp2.y - hp1.y;
      return Math.sqrt(dx * dx + dy * dy);
    } else {
      return calculateDistanceCm(trueP1, trueP2, pixelPerCm);
    }
  };

  const calcCm = (p1Key: string, p2Key: string) => {
    const p1 = pts[p1Key] || { x: 0, y: 0 };
    const p2 = pts[p2Key] || { x: 0, y: 0 };
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
        next[siblingKey] = { x: SCREEN_W - x, y };
      } else if (def.behavior === 'vertical') {
        next[siblingKey] = { x, y: p[siblingKey].y };
      }
      return next;
    });
  };

  const handleShare = async () => {
    try {
      SentinelLogger.start('Result', 'handleShare');
      const msgLines = measurements.map(m => `${m.label}: ${m.value}cm`).join('\n');
      const msg = `ClothMeasure Wyniki (${garmentType}):\n${msgLines}`;
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
            
            // Format history
            addToHistory({
              ...currentResult,
              id: Date.now().toString(),
              timestamp: Date.now(),
              measurements: {
                garmentType: garmentType,
                width: calcCm('cl', 'cr'), // fallback dla spójności starej struktury
                length: calcCm('lt', 'lb'),
                shoulder: calcCm('sl', 'sr'),
                chest: calcCm('cl', 'cr'),
                waist: calcCm('wl', 'wr'),
                lines: measurements.map(m => ({
                  label: m.label,
                  start: pts[m.p1],
                  end: pts[m.p2],
                  color: m.color,
                  valueCm: m.value
                })),
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

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0A0A1A', '#0D1B3E', '#0A0A1A']} style={StyleSheet.absoluteFill} />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pomiar Ręczny</Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} scrollEnabled={true}>
        <View 
          style={styles.imageContainer}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setImageLayoutSize({ width, height });
          }}
        >
          {/* GŁÓWNE EKRANOWE SVG */}
          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
            <SvgImage href={{ uri: imageUri }} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" />
            
            {activeLines.map(lineId => {
              const def = LINE_DEFS[lineId];
              const p1 = pts[def.p1];
              const p2 = pts[def.p2];
              return (
                <G key={lineId}>
                  <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={def.color} strokeWidth="3" strokeDasharray="4 4" />
                  
                  {/* Text z czarną obwódką by był czytelny na każdym tle i nie nakładał się w centrum */}
                  <SvgText x={getTextPos(lineId, p1, p2).x} y={getTextPos(lineId, p1, p2).y} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth="4" fontSize="19" fontWeight="bold" textAnchor={getTextPos(lineId, p1, p2).anchor as any}>
                    {`${calcCm(def.p1, def.p2).toFixed(1)} cm`}
                  </SvgText>
                  <SvgText x={getTextPos(lineId, p1, p2).x} y={getTextPos(lineId, p1, p2).y} fill={def.color} fontSize="19" fontWeight="bold" textAnchor={getTextPos(lineId, p1, p2).anchor as any}>
                    {`${calcCm(def.p1, def.p2).toFixed(1)} cm`}
                  </SvgText>
                  
                  <Circle cx={p1.x} cy={p1.y} r="12" fill={def.color} fillOpacity="0.2" stroke={def.color} strokeWidth="2" />
                  <Circle cx={p2.x} cy={p2.y} r="12" fill={def.color} fillOpacity="0.2" stroke={def.color} strokeWidth="2" />
                </G>
              );
            })}
          </Svg>

          {/* DYNAMICZNE WĘZŁY (PAN RESPONDER) */}
          {activeLines.map(lineId => {
            const def = LINE_DEFS[lineId];
            return (
              <React.Fragment key={`drag_${lineId}`}>
                <DraggablePoint
                  id={def.p1} initialX={pts[def.p1].x} initialY={pts[def.p1].y}
                  onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
                  onMove={(x, y) => handleMove(def, def.p1, def.p2, x, y)}
                />
                <DraggablePoint
                  id={def.p2} initialX={pts[def.p2].x} initialY={pts[def.p2].y}
                  onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
                  onMove={(x, y) => handleMove(def, def.p2, def.p1, x, y)}
                />
              </React.Fragment>
            );
          })}

          {/* LUPA */}
          {activePoint && (
            <View
              style={[
                styles.magnifierWrap,
                {
                  left: activePoint.x > SCREEN_W / 2 ? 16 : SCREEN_W - 136,
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
                      { translateX: -activePoint.x * 2.5 + 60 },
                      { translateY: -activePoint.y * 2.5 + 60 },
                    ],
                  },
                ]}
              />
              <View style={styles.magnifierCrosshair} />
            </View>
          )}
        </View>

        <View style={styles.badgesRow}>
          <View style={[styles.badge, markerFound ? styles.badgeSuccess : styles.badgeWarning]}>
            <Ionicons name={markerFound ? 'checkmark-circle' : 'warning'} size={14} color={markerFound ? '#69FF47' : '#FFD700'} />
            <Text style={[styles.badgeText, { color: markerFound ? '#69FF47' : '#FFD700' }]}>
              {markerFound ? 'Skala: ArUco 10cm' : 'Szacowanie'}
            </Text>
          </View>
          <TouchableOpacity 
            style={[styles.badge, symmetryLocked && { backgroundColor: '#1E2A3A', borderColor: '#00E5FF' }]}
            onPress={() => setSymmetryLocked(!symmetryLocked)}
          >
            <Ionicons name={symmetryLocked ? 'lock-closed' : 'move'} size={14} color={symmetryLocked ? '#00E5FF' : '#8899AA'} />
            <Text style={[styles.badgeText, symmetryLocked && { color: '#00E5FF' }]}>Złączone krawędzie</Text>
          </TouchableOpacity>
        </View>

        {/* Garment Picker */}
        <View style={styles.garmentPicker}>
           <Text style={styles.garmentTitle}>Typ Odzieży:</Text>
           <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.garmentBtns}>
              {(['unknown', 'tshirt', 'pants', 'dress', 'jacket', 'shirt'] as const).map(type => (
                <TouchableOpacity 
                  key={type} 
                  style={[styles.gBtn, garmentType === type && styles.gBtnActive]}
                  onPress={() => setGarmentType(type)}
                >
                  <Text style={styles.gBtnEmoji}>{
                    type === 'unknown' ? '📏' : type === 'tshirt' ? '👕' : type === 'pants' ? '👖' : type === 'dress' ? '👗' : type === 'jacket' ? '🧥' : '👔'
                  }</Text>
                </TouchableOpacity>
              ))}
           </ScrollView>
        </View>

        <View style={styles.measurementsTable}>
          {measurements.map(m => (
            <MeasurementRow key={m.id} label={m.label} value={m.value} color={m.color} icon={m.icon} />
          ))}
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/camera')}>
            <Ionicons name="camera-outline" size={20} color="white" />
            <Text style={styles.actionBtnText}>Nowe zdjęcie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary, saved && styles.actionBtnSaved]} onPress={handleSave} disabled={saved}>
            <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color={saved ? '#0A0A1A' : '#0A0A1A'} />
            <Text style={[styles.actionBtnText, { color: saved ? '#0A0A1A' : '#0A0A1A' }]}>{saved ? 'Zapisano' : 'Zapisz (z tabelą)'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* OFF-SCREEN SVG DLA EKSPORTU Z DOKLEJONĄ TABELKĄ */}
      <View style={{ position: 'absolute', top: -9999, left: -9999, zIndex: -10, opacity: 0 }}>
        <Svg ref={exportSvgRef} width={SCREEN_W} height={IMAGE_HEIGHT + 70 + measurements.length * 36}>
          <Rect x="0" y="0" width={SCREEN_W} height={IMAGE_HEIGHT + 70 + measurements.length * 36} fill="#111828" />
          
          {/* Zdjęcie na górze */}
          <SvgImage href={{ uri: imageUri }} width={SCREEN_W} height={IMAGE_HEIGHT} preserveAspectRatio="xMidYMid meet" />
          
          {/* Linie na zdjęciu */}
          {activeLines.map(lineId => {
            const def = LINE_DEFS[lineId];
            const p1 = pts[def.p1];
            const p2 = pts[def.p2];
            return (
              <G key={`exp_${lineId}`}>
                <Line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={def.color} strokeWidth="3" strokeDasharray="4 4" />
                
                <SvgText x={getTextPos(lineId, p1, p2).x} y={getTextPos(lineId, p1, p2).y} fill="none" stroke="rgba(0,0,0,0.75)" strokeWidth="4" fontSize="19" fontWeight="bold" textAnchor={getTextPos(lineId, p1, p2).anchor as any}>
                  {`${calcCm(def.p1, def.p2).toFixed(1)} cm`}
                </SvgText>
                <SvgText x={getTextPos(lineId, p1, p2).x} y={getTextPos(lineId, p1, p2).y} fill={def.color} fontSize="19" fontWeight="bold" textAnchor={getTextPos(lineId, p1, p2).anchor as any}>
                  {`${calcCm(def.p1, def.p2).toFixed(1)} cm`}
                </SvgText>
                
                <Circle cx={p1.x} cy={p1.y} r="12" fill={def.color} fillOpacity="0.2" stroke={def.color} strokeWidth="2" />
                <Circle cx={p2.x} cy={p2.y} r="12" fill={def.color} fillOpacity="0.2" stroke={def.color} strokeWidth="2" />
              </G>
            );
          })}

          {/* Tabelka doklejona pod zdjęciem */}
          <SvgText x="16" y={IMAGE_HEIGHT + 30} fill="#FFFFFF" fontSize="20" fontWeight="bold">Podsumowanie Pomiarów</SvgText>
          
          {measurements.map((m, idx) => (
            <G key={`tbl_${m.id}`}>
              <Circle cx="24" cy={IMAGE_HEIGHT + 56 + idx * 36} r="6" fill={m.color} />
              <SvgText x="40" y={IMAGE_HEIGHT + 62 + idx * 36} fill="#CCDDEE" fontSize="16" fontWeight="bold">{m.label}</SvgText>
              {/* Zawsze używamy szablonu ze sztywnym miejscem po przecinku dla pięknego wyrównania w kolumnie */}
              <SvgText x={SCREEN_W - 40} y={IMAGE_HEIGHT + 62 + idx * 36} fill={m.color} fontSize="18" fontWeight="bold" textAnchor="end">{`${m.value.toFixed(1)} cm`}</SvgText>
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
  shareBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingBottom: 40 },
  imageContainer: { width: SCREEN_W, height: IMAGE_HEIGHT, backgroundColor: '#050510', position: 'relative' },
  
  draggablePoint: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 30, 0.4)',
    marginLeft: -22, marginTop: -22,
  },

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
  actionsRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 4 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14 },
  actionBtnPrimary: { backgroundColor: '#00E5FF' },
  actionBtnSecondary: { backgroundColor: '#1E2A3A' },
  actionBtnSaved: { backgroundColor: '#1E2A3A' },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },
  garmentPicker: { paddingHorizontal: 16, marginBottom: 12 },
  garmentTitle: { fontSize: 13, color: '#8899AA', marginBottom: 8, fontWeight: '600' },
  garmentBtns: { flexDirection: 'row', gap: 12, paddingBottom: 4 },
  gBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center' },
  gBtnActive: { backgroundColor: '#00E5FF30', borderWidth: 1, borderColor: '#00E5FF' },
  gBtnEmoji: { fontSize: 22 },
});
