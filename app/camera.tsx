// app/camera.tsx — CameraScreen
import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions, CameraType } from 'expo-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMeasurementStore } from '../src/stores/measurementStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [zoom, setZoom] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const setCapturedImageUri = useMeasurementStore((s) => s.setCapturedImageUri);

  // Animacja migawki
  const flashAnim = useRef(new Animated.Value(0)).current;

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);

    // Animacja migawki
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        base64: false,
        exif: false,
      });

      if (photo?.uri) {
        // Znormalizowanie EXIF, by fizyczne piksele pokrywały się z osią XY bez rotacji. Zapobiega "randomowym" cięciom.
        const normalized = await ImageManipulator.manipulateAsync(
          photo.uri,
          [],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
        );
        setCapturedImageUri(normalized.uri);
        router.push('/crop');
      }
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się zrobić zdjęcia. Spróbuj ponownie.');
      console.error('[Camera] Błąd zdjęcia:', e);
    } finally {
      setIsCapturing(false);
    }
  };

  const handlePickFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets[0]) {
        const normalized = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
        );
        setCapturedImageUri(normalized.uri);
        router.push('/crop');
      }
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się otworzyć galerii.');
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#00E5FF" />
        <Text style={styles.permissionTitle}>Dostęp do kamery</Text>
        <Text style={styles.permissionText}>
          ClothMeasure potrzebuje kamery, aby fotografować ubrania i dokonywać pomiarów.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Zezwól na dostęp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Wróć</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Kamera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        flash={flash}
        zoom={zoom}
      />
      
      {/* UI Overlay */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* Migawka overlay */}
        <Animated.View
          style={[styles.flashOverlay, { opacity: flashAnim }]}
          pointerEvents="none"
        />

        {/* Górny pasek */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>

          <View style={styles.topBarCenter}>
            <Text style={styles.topBarTitle}>Fotografuj ubranie</Text>
          </View>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => setFlash(f => f === 'off' ? 'on' : 'off')}
          >
            <Ionicons
              name={flash === 'on' ? 'flash' : 'flash-off'}
              size={24}
              color={flash === 'on' ? '#FFD700' : 'white'}
            />
          </TouchableOpacity>
        </View>

        {/* Ramka celowania z instrukcją */}
        <View style={styles.overlayContainer}>
          {/* Rogi ramki */}
          <View style={styles.frame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Instrukcja wewnątrz ramki */}
            <View style={styles.frameHint}>
              <Ionicons name="scan-outline" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.frameHintText}>
                Połóż ubranie na płaskiej powierzchni{'\n'}
                z markerem kalibracyjnym obok
              </Text>
            </View>
          </View>
        </View>


        {/* Zoom Controls */}
        <View style={styles.zoomControls}>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoom === 0 && styles.zoomBtnActive]} 
            onPress={() => setZoom(0)}
          >
            <Text style={[styles.zoomBtnText, zoom === 0 && styles.zoomBtnTextActive]}>1x</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoom === 0.03 && styles.zoomBtnActive]} 
            onPress={() => setZoom(0.03)}
          >
            <Text style={[styles.zoomBtnText, zoom === 0.03 && styles.zoomBtnTextActive]}>2x</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.zoomBtn, zoom === 0.06 && styles.zoomBtnActive]} 
            onPress={() => setZoom(0.06)}
          >
            <Text style={[styles.zoomBtnText, zoom === 0.06 && styles.zoomBtnTextActive]}>3x</Text>
          </TouchableOpacity>
        </View>

        {/* Dolny pasek kontrolny */}
        <View style={styles.bottomBar}>
          {/* Galeria */}
          <TouchableOpacity style={styles.sideBtn} onPress={handlePickFromGallery}>
            <Ionicons name="images-outline" size={28} color="white" />
            <Text style={styles.sideBtnLabel}>Galeria</Text>
          </TouchableOpacity>

          {/* Przycisk wyzwalacza */}
          <TouchableOpacity
            style={[styles.shutterBtn, isCapturing && styles.shutterBtnActive]}
            onPress={handleCapture}
            disabled={isCapturing}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>

          {/* Odwróć kamerę */}
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')}
          >
            <Ionicons name="camera-reverse-outline" size={28} color="white" />
            <Text style={styles.sideBtnLabel}>Obróć</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  flashOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 100,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0A0A1A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: 'white',
    marginTop: 16,
  },
  permissionText: {
    fontSize: 15,
    color: '#8899AA',
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionBtn: {
    backgroundColor: '#00E5FF',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    marginTop: 8,
  },
  permissionBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0A0A1A',
  },
  backBtn: { paddingVertical: 12 },
  backBtnText: { fontSize: 15, color: '#667788' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 55 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  topBarCenter: {
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  frame: {
    width: SCREEN_W * 0.85,
    height: SCREEN_W * 0.85 * 1.2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#00E5FF',
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  frameHint: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
  },
  frameHintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },

  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sideBtn: {
    alignItems: 'center',
    gap: 4,
    width: 64,
  },
  sideBtnLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'white',
  },
  shutterBtnActive: {
    backgroundColor: 'rgba(0,229,255,0.3)',
    borderColor: '#00E5FF',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'white',
  },
  zoomControls: {
    position: 'absolute',
    right: 16,
    bottom: 120,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  zoomBtnActive: {
    backgroundColor: '#00E5FF',
  },
  zoomBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  zoomBtnTextActive: {
    color: '#0A0A1A',
  },
});
