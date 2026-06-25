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
    Image.getSize(capturedImageUri, (width, height) => {
      setActualImageSize({ width, height });
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
      // Image w React Native z resizeMode="contain" dodaje puste paski (letterbox/pillarbox).
      // Musimy wyliczyć RZECZYWISTY rozmiar i pozycję wyświetlanego zdjęcia na ekranie:
      const viewAspect = imageLayout.width / imageLayout.height;
      const imgAspect = actualImageSize.width / actualImageSize.height;

      let visualWidth = imageLayout.width;
      let visualHeight = imageLayout.height;
      let offsetX = 0;
      let offsetY = 0;

      if (imgAspect > viewAspect) {
        // Zdjęcie ograniczone szerokością ekranu (letterbox na górze i dole)
        visualHeight = imageLayout.width / imgAspect;
        offsetY = (imageLayout.height - visualHeight) / 2;
      } else {
        // Zdjęcie ograniczone wysokością ekranu (pillarbox po bokach)
        visualWidth = imageLayout.height * imgAspect;
        offsetX = (imageLayout.width - visualWidth) / 2;
      }

      // Skala z wyświetlanego (rzeczywistego) obrazka na wymiary surowego pliku
      const scale = actualImageSize.width / visualWidth;

      // Odejmujemy letterboxy, żeby uzyskać pozycję w obrębie wyświetlanego zdjęcia
      const realLeft = Math.max(0, cropBox.left - offsetX);
      const realTop = Math.max(0, cropBox.top - offsetY);
      const realRight = Math.max(0, cropBox.right - offsetX);
      const realBottom = Math.max(0, cropBox.bottom - offsetY);

      let originX = Math.floor(realLeft * scale);
      let originY = Math.floor(realTop * scale);
      let width = Math.floor((visualWidth - realLeft - realRight) * scale);
      let height = Math.floor((visualHeight - realTop - realBottom) * scale);

      // Zabezpieczenie przed wyjściem poza granice surowego pliku
      originX = Math.max(0, Math.min(originX, actualImageSize.width - 1));
      originY = Math.max(0, Math.min(originY, actualImageSize.height - 1));
      width = Math.max(1, Math.min(width, actualImageSize.width - originX));
      height = Math.max(1, Math.min(height, actualImageSize.height - originY));

      const cropped = await ImageManipulator.manipulateAsync(
        capturedImageUri,
        [{ crop: { originX, originY, width, height } }],
        { format: ImageManipulator.SaveFormat.JPEG, compress: 0.9 }
      );

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
