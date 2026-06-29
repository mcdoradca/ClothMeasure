import React, { useRef, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Share,
  Platform,
  PanResponder,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { calculateDistanceCm } from '../src/algorithms/measurement';
import { applyHomography } from '../src/algorithms/perspective';
import { SentinelLogger } from '../src/utils/logger';

const { width: SCREEN_W } = Dimensions.get('window');
const IMAGE_HEIGHT = SCREEN_W * 1.33; // Współczynnik proporcji domyślnego zdjęcia kamery 4:3

function DraggablePoint({
  id,
  initialX,
  initialY,
  color,
  onMove,
  onActive,
}: {
  id: string;
  initialX: number;
  initialY: number;
  color: string;
  onMove: (x: number, y: number) => void;
  onActive: (active: boolean, x: number, y: number) => void;
}) {
  // Pamięć pozycji początkowej w momencie wciśnięcia (eliminuje sprzężenie dzikich przesunięć)
  const startPos = useRef({ x: initialX, y: initialY });
  // Używamy aktualnej pozycji ze statu jako bazy, jeśli rodzeństwo przemieściło ten punkt.
  // Aby uniknąć stale starych closure w PanResponderze z React, przemycamy aktualną props.pozycję.
  const currPos = useRef({ x: initialX, y: initialY });
  currPos.current = { x: initialX, y: initialY };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // Zamrożenie punktu startowego pod gest
        startPos.current = { x: currPos.current.x, y: currPos.current.y };
        onActive(true, currPos.current.x, currPos.current.y);
      },
      onPanResponderMove: (e, gesture) => {
        // Czysta matematyka bazująca na startPos i delcie z palca
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
          borderColor: color,
          left: initialX,
          top: initialY,
        },
      ]}
    >
      <View style={[styles.crosshairV, { backgroundColor: color }]} />
      <View style={[styles.crosshairH, { backgroundColor: color }]} />
    </View>
  );
}

export default function ResultScreen() {
  const currentResult = useMeasurementStore((s) => s.currentResult);
  const addToHistory = useMeasurementStore((s) => s.addToHistory);
  const [saved, setSaved] = useState(false);

  const [pts, setPts] = useState({
    sl: { x: SCREEN_W * 0.25, y: IMAGE_HEIGHT * 0.25 },
    sr: { x: SCREEN_W * 0.75, y: IMAGE_HEIGHT * 0.25 },
    cl: { x: SCREEN_W * 0.20, y: IMAGE_HEIGHT * 0.40 },
    cr: { x: SCREEN_W * 0.80, y: IMAGE_HEIGHT * 0.40 },
    wl: { x: SCREEN_W * 0.22, y: IMAGE_HEIGHT * 0.65 },
    wr: { x: SCREEN_W * 0.78, y: IMAGE_HEIGHT * 0.65 },
    lt: { x: SCREEN_W * 0.5, y: IMAGE_HEIGHT * 0.15 },
    lb: { x: SCREEN_W * 0.5, y: IMAGE_HEIGHT * 0.85 },
  });

  const [garmentType, setGarmentType] = useState<'tshirt'|'pants'|'dress'|'jacket'|'shirt'|'unknown'>('tshirt');
  const [symmetryLocked, setSymmetryLocked] = useState(false);

  // Image Aspect state for math
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  // Zmienna lokalna powiększalnika
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

  // Matematyka na letterboxing (contain resizeMode) w celu skrajnej precyzji:
  const getTrueDistance = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    // Twarde rozmiary obrazu roboczego, dla którego ArUco zwróciło pixelPerCm, aby uciąć bug z EXIF density Image.getSize()
    const imgW = imageWidth || 1200;
    const imgH = imageHeight || 1600;

    if (pixelPerCm <= 0) return 0;

    const viewW = SCREEN_W;
    const viewH = IMAGE_HEIGHT;
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

    // Pozycje przeskalowane do przestrzeni oryginalnego obrazu (po odjęciu pustych pasków)
    const trueP1 = {
      x: (p1.x - offsetX) * scaleToOriginal,
      y: (p1.y - offsetY) * scaleToOriginal,
    };
    const trueP2 = {
      x: (p2.x - offsetX) * scaleToOriginal,
      y: (p2.y - offsetY) * scaleToOriginal,
    };

    if (homographyMatrix) {
      const hp1 = applyHomography(trueP1, homographyMatrix);
      const hp2 = applyHomography(trueP2, homographyMatrix);
      // Odległość euklidesowa w przestrzeni CM markera referencyjnego (rzut z góry)
      const dx = hp2.x - hp1.x;
      const dy = hp2.y - hp1.y;
      return Math.sqrt(dx * dx + dy * dy);
    } else {
      return calculateDistanceCm(trueP1, trueP2, pixelPerCm);
    }
  };

  // --- STATISTICAL ALLOWANCE NETWORK ---
  // Kompensacja "Shrinkage Bias" dla krawiectwa 3D vs rzutu płaskiego 2D.
  const allowances = {
    tshirt: { shoulder: 1.110, chest: 1.095, waist: 1.050, length: 1.072 },
    shirt:  { shoulder: 1.085, chest: 1.075, waist: 1.050, length: 1.055 },
    jacket: { shoulder: 1.095, chest: 1.085, waist: 1.050, length: 1.065 },
    pants:  { shoulder: 1.000, chest: 1.000, waist: 1.070, length: 1.045 },
    dress:  { shoulder: 1.085, chest: 1.085, waist: 1.070, length: 1.065 },
    unknown:{ shoulder: 1.000, chest: 1.000, waist: 1.000, length: 1.000 },
  };

  const currentAllowance = allowances[garmentType] || allowances.unknown;

  const shoulderCm = Math.round(getTrueDistance(pts.sl, pts.sr) * currentAllowance.shoulder * 2) / 2;
  const chestCm = Math.round(getTrueDistance(pts.cl, pts.cr) * currentAllowance.chest * 2) / 2;
  const waistCm = Math.round(getTrueDistance(pts.wl, pts.wr) * currentAllowance.waist * 2) / 2;
  const lengthCm = Math.round(getTrueDistance(pts.lt, pts.lb) * currentAllowance.length * 2) / 2;
  const widthCm = chestCm; // traktujemy klatkę główną jako Width

  const handleShare = async () => {
    try {
      SentinelLogger.start('Result', 'handleShare');
      const msg = `ClothMeasure Wyniki:\nDługość: ${lengthCm}cm\nRamiona: ${shoulderCm}cm\nKlatka: ${chestCm}cm\nTalia: ${waistCm}cm`;
      await Share.share({ message: msg, title: 'Wymiary z ClothMeasure' });
      SentinelLogger.success('Result', 'handleShare');
    } catch (e) {
      SentinelLogger.error('Result', 'handleShare', e);
    }
  };

  const handleSave = async () => {
    try {
      SentinelLogger.start('Result', 'handleSave');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageUri, { mimeType: 'image/jpeg', dialogTitle: 'Zapisz zdjęcie' });
        setSaved(true);
        addToHistory({
          ...currentResult,
          id: Date.now().toString(),
          timestamp: Date.now(),
          measurements: {
            garmentType: garmentType,
            width: widthCm,
            length: lengthCm,
            shoulder: shoulderCm,
            chest: chestCm,
            waist: waistCm,
            lines: [
              { label: 'Długość', start: pts.lt, end: pts.lb, color: '#C77DFF', valueCm: lengthCm },
              { label: 'Ramiona', start: pts.sl, end: pts.sr, color: '#00E5FF', valueCm: shoulderCm },
              { label: 'Klatka', start: pts.cl, end: pts.cr, color: '#69FF47', valueCm: chestCm },
              { label: 'Talia', start: pts.wl, end: pts.wr, color: '#FF6B6B', valueCm: waistCm },
            ],
            confidence: 1,
          },
        });
        SentinelLogger.success('Result', 'handleSave');
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
        <View style={styles.imageContainer}>
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />

          {/* Linie celownicze narysowane niżej zjawisk */}
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            <Svg width="100%" height="100%">
              <Line x1={pts.sl.x} y1={pts.sl.y} x2={pts.sr.x} y2={pts.sr.y} stroke="#00E5FF" strokeWidth="2" strokeDasharray="4 4" />
              <Line x1={pts.cl.x} y1={pts.cl.y} x2={pts.cr.x} y2={pts.cr.y} stroke="#69FF47" strokeWidth="2" strokeDasharray="4 4" />
              <Line x1={pts.wl.x} y1={pts.wl.y} x2={pts.wr.x} y2={pts.wr.y} stroke="#FF6B6B" strokeWidth="2" strokeDasharray="4 4" />
              <Line x1={pts.lt.x} y1={pts.lt.y} x2={pts.lb.x} y2={pts.lb.y} stroke="#C77DFF" strokeWidth="2" strokeDasharray="4 4" />
            </Svg>
          </View>

          {/* DYNAMICZNE WĘZŁY (AUTO-POZIOMOWANIE I SYMETRIA) */}
          {/* Ramiona */}
          <DraggablePoint
            id="sl" initialX={pts.sl.x} initialY={pts.sl.y} color="#00E5FF"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, sl: { x, y }, sr: { x: symmetryLocked ? SCREEN_W - x : p.sr.x, y } }))}
          />
          <DraggablePoint
            id="sr" initialX={pts.sr.x} initialY={pts.sr.y} color="#00E5FF"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, sr: { x, y }, sl: { x: symmetryLocked ? SCREEN_W - x : p.sl.x, y } }))}
          />
          {/* Klatka */}
          <DraggablePoint
            id="cl" initialX={pts.cl.x} initialY={pts.cl.y} color="#69FF47"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, cl: { x, y }, cr: { x: symmetryLocked ? SCREEN_W - x : p.cr.x, y } }))}
          />
          <DraggablePoint
            id="cr" initialX={pts.cr.x} initialY={pts.cr.y} color="#69FF47"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, cr: { x, y }, cl: { x: symmetryLocked ? SCREEN_W - x : p.cl.x, y } }))}
          />
          {/* Talia */}
          <DraggablePoint
            id="wl" initialX={pts.wl.x} initialY={pts.wl.y} color="#FF6B6B"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, wl: { x, y }, wr: { x: symmetryLocked ? SCREEN_W - x : p.wr.x, y } }))}
          />
          <DraggablePoint
            id="wr" initialX={pts.wr.x} initialY={pts.wr.y} color="#FF6B6B"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, wr: { x, y }, wl: { x: symmetryLocked ? SCREEN_W - x : p.wl.x, y } }))}
          />
          {/* Długość (AUTO-PION) */}
          <DraggablePoint
            id="lt" initialX={pts.lt.x} initialY={pts.lt.y} color="#C77DFF"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, lt: { x, y }, lb: { x, y: p.lb.y } }))}
          />
          <DraggablePoint
            id="lb" initialX={pts.lb.x} initialY={pts.lb.y} color="#C77DFF"
            onActive={(a, x, y) => setActivePoint(a ? { x, y } : null)}
            onMove={(x, y) => setPts(p => ({ ...p, lb: { x, y }, lt: { x, y: p.lt.y } }))}
          />

          {/* LUPA (MAGNIFYING GLASS) */}
          {activePoint && (
            <View
              style={[
                styles.magnifierWrap,
                {
                  left: activePoint.x > SCREEN_W / 2 ? 16 : SCREEN_W - 136, // Przerzucaj lupę na drugą stronę
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
           <View style={styles.garmentBtns}>
              {(['tshirt', 'pants', 'dress', 'jacket', 'shirt'] as const).map(type => (
                <TouchableOpacity 
                  key={type} 
                  style={[styles.gBtn, garmentType === type && styles.gBtnActive]}
                  onPress={() => setGarmentType(type)}
                >
                  <Text style={styles.gBtnEmoji}>{
                    type === 'tshirt' ? '👕' : type === 'pants' ? '👖' : type === 'dress' ? '👗' : type === 'jacket' ? '🧥' : '👔'
                  }</Text>
                </TouchableOpacity>
              ))}
           </View>
        </View>

        <View style={styles.measurementsTable}>
          <MeasurementRow label="Długość" value={lengthCm} color="#C77DFF" icon="arrow-down-outline" />
          <MeasurementRow label="Ramiona" value={shoulderCm} color="#00E5FF" icon="body-outline" />
          <MeasurementRow label="Klatka" value={chestCm} color="#69FF47" icon="heart-outline" />
          <MeasurementRow label="Talia" value={waistCm} color="#FF6B6B" icon="fitness-outline" />
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => router.push('/camera')}>
            <Ionicons name="camera-outline" size={20} color="white" />
            <Text style={styles.actionBtnText}>Nowe zdjęcie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary, saved && styles.actionBtnSaved]} onPress={handleSave} disabled={saved}>
            <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={20} color={saved ? '#69FF47' : '#0A0A1A'} />
            <Text style={[styles.actionBtnText, { color: saved ? '#69FF47' : '#0A0A1A' }]}>{saved ? 'Zapisano' : 'Zapisz'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
      <Text style={[styles.measurementValue, { color }]}>{value} cm</Text>
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
  image: { width: '100%', height: '100%' },
  
  draggablePoint: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(20, 20, 30, 0.4)',
    marginLeft: -22, marginTop: -22,
  },
  crosshairV: { position: 'absolute', width: 1, height: 16 },
  crosshairH: { position: 'absolute', width: 16, height: 1 },

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
  garmentPicker: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12 },
  garmentTitle: { fontSize: 13, color: '#8899AA', marginRight: 12, fontWeight: '600' },
  garmentBtns: { flexDirection: 'row', gap: 8 },
  gBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center' },
  gBtnActive: { backgroundColor: '#00E5FF30', borderWidth: 1, borderColor: '#00E5FF' },
  gBtnEmoji: { fontSize: 20 },
});
