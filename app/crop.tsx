import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image, PanResponder, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMeasurementStore } from '../src/stores/measurementStore';

const { width: SCREEN_W } = Dimensions.get('window');

export default function CropScreen() {
  const capturedImageUri = useMeasurementStore((s) => s.capturedImageUri);
  const setCapturedImageUri = useMeasurementStore((s) => s.setCapturedImageUri);

  const [imageLayout, setImageLayout] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const [actualImageSize, setActualImageSize] = useState({ width: 1, height: 1 });

  // Crop box state (relative to the rendered image view)
  const [cropBox, setCropBox] = useState({ top: 10, left: 10, bottom: 10, right: 10 });
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!capturedImageUri) {
      router.replace('/');
      return;
    }
    // Pobierz RZECZYWISTE wymiary pikselowe z ImageManipulator (ta sama instancja co crop).
    // Image.getSize potrafi zwracać wymiary PO rotacji EXIF, podczas gdy crop operuje na surowym buforze.
    ImageManipulator.manipulateAsync(
      capturedImageUri,
      [],
      { format: ImageManipulator.SaveFormat.JPEG, compress: 1 }
    ).then(info => {
      console.log('[Crop] ImageManipulator dims:', info.width, 'x', info.height);
      setActualImageSize({ width: info.width, height: info.height });

      // Cross-check z Image.getSize
      Image.getSize(capturedImageUri, (w, h) => {
        console.log('[Crop] Image.getSize dims:', w, 'x', h);
        if (w !== info.width || h !== info.height) {
          console.warn('[Crop] ⚠️ WYMIARY SIĘ RÓŻNIĄ! EXIF bug.');
        }
      });
    }).catch(() => {
      // Fallback
      Image.getSize(capturedImageUri, (w, h) => {
        console.log('[Crop] Fallback Image.getSize:', w, 'x', h);
        setActualImageSize({ width: w, height: h });
      });
    });
  }, [capturedImageUri]);

  // Przechowujemy wartość cropBox na początku gestu, żeby gestureState.dy (kumulacyjny)
  // był odliczany od stałej bazy, a nie od ciągle zmieniającej się wartości.
  const gestureStartCropBox = useRef(cropBox);
  
  // Ref śledzący zawsze najnowszą wartość stanu, omijający stale closure w PanResponder
  const latestCropBox = useRef(cropBox);
  const latestImageLayout = useRef(imageLayout);
  
  useEffect(() => {
    latestCropBox.current = cropBox;
  }, [cropBox]);

  useEffect(() => {
    latestImageLayout.current = imageLayout;
  }, [imageLayout]);

  const createPanResponder = (handle: 'top' | 'bottom' | 'left' | 'right') => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        gestureStartCropBox.current = latestCropBox.current;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const start = gestureStartCropBox.current;
        const layout = latestImageLayout.current;
        const next = { ...start };

        if (handle === 'top') next.top = Math.max(0, start.top + gestureState.dy);
        if (handle === 'bottom') next.bottom = Math.max(0, start.bottom - gestureState.dy);
        if (handle === 'left') next.left = Math.max(0, start.left + gestureState.dx);
        if (handle === 'right') next.right = Math.max(0, start.right - gestureState.dx);

        if (layout.height - next.top - next.bottom < 50) return;
        if (layout.width - next.left - next.right < 50) return;

        setCropBox(next);
      },
      onPanResponderRelease: () => {},
    });
  };

  const panTop = useRef(createPanResponder('top')).current;
  const panBottom = useRef(createPanResponder('bottom')).current;
  const panLeft = useRef(createPanResponder('left')).current;
  const panRight = useRef(createPanResponder('right')).current;

  const handleCrop = async () => {
    if (!capturedImageUri || imageLayout.width === 0) return;
    setIsProcessing(true);

    try {
      // ---- Krok 1: Wylicz gdzie fizycznie renderuje się zdjęcie wewnątrz komponentu Image ----
      // Komponent Image ma wymiary imageLayout (== cały imageWrapper).
      // Z resizeMode="contain" zdjęcie jest wycentrowane i może mieć puste pasy.
      const viewW = imageLayout.width;
      const viewH = imageLayout.height;
      const imgW = actualImageSize.width;
      const imgH = actualImageSize.height;

      const viewAspect = viewW / viewH;
      const imgAspect = imgW / imgH;

      let renderedW: number, renderedH: number, padLeft: number, padTop: number;

      if (imgAspect > viewAspect) {
        // Zdjęcie szersze niż widok → dopasowane do szerokości, pasy na górze/dole
        renderedW = viewW;
        renderedH = viewW / imgAspect;
        padLeft = 0;
        padTop = (viewH - renderedH) / 2;
      } else {
        // Zdjęcie wyższe niż widok → dopasowane do wysokości, pasy po bokach
        renderedH = viewH;
        renderedW = viewH * imgAspect;
        padLeft = (viewW - renderedW) / 2;
        padTop = 0;
      }

      // ---- Krok 2: Przelicz cropBox (insety od krawędzi WIDOKU) na prostokąt wewnątrz WIDOKU ----
      const cropViewLeft = cropBox.left;
      const cropViewTop = cropBox.top;
      const cropViewRight = viewW - cropBox.right;
      const cropViewBottom = viewH - cropBox.bottom;

      // ---- Krok 3: Przelicz na współrzędne wewnątrz renderowanego zdjęcia ----
      // Odejmij padding (pozycję lewego-górnego rogu zdjęcia w widoku)
      const imgLocalLeft = Math.max(0, cropViewLeft - padLeft);
      const imgLocalTop = Math.max(0, cropViewTop - padTop);
      const imgLocalRight = Math.min(renderedW, cropViewRight - padLeft);
      const imgLocalBottom = Math.min(renderedH, cropViewBottom - padTop);

      // ---- Krok 4: Skaluj do wymiarów surowego pliku ----
      const scaleX = imgW / renderedW;
      const scaleY = imgH / renderedH;

      let originX = Math.round(imgLocalLeft * scaleX);
      let originY = Math.round(imgLocalTop * scaleY);
      let width = Math.round((imgLocalRight - imgLocalLeft) * scaleX);
      let height = Math.round((imgLocalBottom - imgLocalTop) * scaleY);

      // Clamp do granic pliku
      originX = Math.max(0, Math.min(originX, imgW - 1));
      originY = Math.max(0, Math.min(originY, imgH - 1));
      width = Math.max(1, Math.min(width, imgW - originX));
      height = Math.max(1, Math.min(height, imgH - originY));

      console.log('[Crop] view:', viewW, 'x', viewH,
        '| rendered:', renderedW.toFixed(0), 'x', renderedH.toFixed(0),
        '| pad:', padLeft.toFixed(0), padTop.toFixed(0),
        '| cropBox:', JSON.stringify(cropBox),
        '| origin:', originX, originY, '| size:', width, 'x', height,
        '| file:', imgW, 'x', imgH);

      const cropped = await ImageManipulator.manipulateAsync(
        capturedImageUri,
        [{ crop: { originX, originY, width, height } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
      );

      console.log('[Crop] Wynik:', cropped.width, 'x', cropped.height,
        '(oczekiwano:', width, 'x', height, ')');
      setCapturedImageUri(cropped.uri);
      router.replace('/processing');
    } catch (e) {
      console.error('Cropping error:', e);
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Wykadruj ubranie</Text>
        <View style={{ width: 40 }} />
      </View>

      {!capturedImageUri && (
        <Text style={styles.instruction}>Ładowanie...</Text>
      )}
      {capturedImageUri && (
        <Text style={styles.instruction}>
          Zostaw w kadrze TYLKO ubranie oraz marker. Zmniejsz ramkę, by usunąć tło i stopy.
        </Text>
      )}

      <View style={styles.imageWrapper}>
        <Image
          source={{ uri: capturedImageUri || undefined }}
          style={styles.image}
          resizeMode="contain"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setImageLayout({ width, height, x: 0, y: 0 });
            setCropBox({ top: 20, left: 20, bottom: 20, right: 20 });
          }}
        />

        {imageLayout.width > 0 && (
          <View style={StyleSheet.absoluteFill}>
            <View style={[styles.overlay, { height: cropBox.top, width: '100%', top: 0 }]} />
            <View style={[styles.overlay, { height: cropBox.bottom, width: '100%', bottom: 0 }]} />
            <View style={[styles.overlay, { top: cropBox.top, bottom: cropBox.bottom, left: 0, width: cropBox.left }]} />
            <View style={[styles.overlay, { top: cropBox.top, bottom: cropBox.bottom, right: 0, width: cropBox.right }]} />

            <View style={[
              styles.cropFrame,
              { top: cropBox.top, bottom: cropBox.bottom, left: cropBox.left, right: cropBox.right }
            ]} />

            <View {...panTop.panHandlers} style={[styles.handle, styles.handleTop, { top: cropBox.top - 15 }]}><View style={styles.handleBar} /></View>
            <View {...panBottom.panHandlers} style={[styles.handle, styles.handleBottom, { bottom: cropBox.bottom - 15 }]}><View style={styles.handleBar} /></View>
            <View {...panLeft.panHandlers} style={[styles.handle, styles.handleLeft, { left: cropBox.left - 15 }]}><View style={styles.handleVerticalBar} /></View>
            <View {...panRight.panHandlers} style={[styles.handle, styles.handleRight, { right: cropBox.right - 15 }]}><View style={styles.handleVerticalBar} /></View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleCrop} disabled={isProcessing}>
          <Text style={styles.actionBtnText}>{isProcessing ? 'Wycinanie...' : 'Gotowe'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 55, paddingHorizontal: 16, paddingBottom: 10,
    backgroundColor: '#0A0A1A',
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 18, color: 'white', fontWeight: 'bold' },
  instruction: {
    color: '#00E5FF', textAlign: 'center', paddingHorizontal: 20,
    marginBottom: 10, fontSize: 13,
  },
  imageWrapper: {
    flex: 1, marginHorizontal: 16, marginBottom: 16, backgroundColor: '#050510',
    overflow: 'hidden', position: 'relative', borderRadius: 8
  },
  image: { width: '100%', height: '100%' },
  overlay: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.7)' },
  cropFrame: { position: 'absolute', borderWidth: 2, borderColor: '#00E5FF' },
  handle: { position: 'absolute', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  handleTop: { left: 0, right: 0, height: 30 },
  handleBottom: { left: 0, right: 0, height: 30 },
  handleLeft: { top: 0, bottom: 0, width: 30 },
  handleRight: { top: 0, bottom: 0, width: 30 },
  handleBar: { width: 60, height: 4, backgroundColor: 'white', borderRadius: 2 },
  handleVerticalBar: { width: 4, height: 60, backgroundColor: 'white', borderRadius: 2 },
  footer: { padding: 20, paddingBottom: 40, backgroundColor: '#0A0A1A' },
  actionBtn: { backgroundColor: '#00E5FF', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#0A0A1A', fontSize: 16, fontWeight: 'bold' },
});
