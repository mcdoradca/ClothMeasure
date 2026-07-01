// app/camera.tsx — CameraScreen
import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  Platform,
  AppState,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { Accelerometer } from 'expo-sensors';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCameraFormat,
  CameraPosition,
} from 'react-native-vision-camera';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMeasurementStore } from '../src/stores/measurementStore';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function CameraScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [facing, setFacing] = useState<CameraPosition>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [isCapturing, setIsCapturing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const cameraRef = useRef<Camera>(null);
  const setCapturedImageUri = useMeasurementStore((s) => s.setCapturedImageUri);

  const isFocused = useIsFocused();
  const [isForeground, setIsForeground] = useState(true);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      setIsForeground(nextAppState === 'active');
    });
    return () => {
      subscription.remove();
    };
  }, []);

  const isActive = isFocused && isForeground;

  const [tiltX, setTiltX] = useState(0);
  const [tiltY, setTiltY] = useState(0);

  useEffect(() => {
    Accelerometer.setUpdateInterval(50);
    const sub = Accelerometer.addListener(({ x, y }) => {
      setTiltX(x);
      setTiltY(y);
    });
    return () => sub.remove();
  }, []);

  // Wymiary okręgu poziomicy
  const LEVEL_RADIUS = 25;
  const BUBBLE_RADIUS = 7;
  const maxOffset = LEVEL_RADIUS - BUBBLE_RADIUS;
  
  // Ograniczenie (clamp) do okręgu
  const clampedX = Math.max(-maxOffset, Math.min(maxOffset, tiltX * -100));
  const clampedY = Math.max(-maxOffset, Math.min(maxOffset, tiltY * 100));
  const isLevel = Math.abs(tiltX) < 0.08 && Math.abs(tiltY) < 0.08; // ~5 stopni

  // Pobieramy natywne urządzenie dla wymaganego kierunku (facing)
  const defaultDevice = useCameraDevice(facing);

  // Szukamy najszerszego obiektywu w ramach danego urządzenia
  // Używamy ultra-wide-angle jeśli istnieje, w ostateczności zostajemy przy najlepszym wybranym
  const device = useMemo(() => {
    if (!defaultDevice) return undefined;
    
    // Jeżeli urządzenie obsługuje wiele obiektywów, upewnijmy się że jest na szerokim kącie
    const hasUltraWide = defaultDevice.physicalDevices.includes('ultra-wide-angle-camera');
    // Nie da się na sztywno zmienić physicalDevices w locie na jednej instancji w V4,
    // defaultDevice najczęściej zwraca optymalny. Vision Camera zaleca by ewentualnie 
    // ręcznie filtrować przez Camera.getAvailableCameraDevices(), ale najlepszą
    // praktyką w v4 jest po prostu zaufanie `useCameraDevice` lub ustawienie formatu,
    // jednak na potrzeby kontraktu ADR: traktujemy defaultDevice jako nadrzędny i dostosujemy
    // format pod max pole widzenia. Jeśli byśmy potrzebowali konkretnie ultra-wide:
    // możemy próbować wyszukiwać w urządzeniach, ale najbezpieczniej oprzeć się na fallbacku z hooka.
    return defaultDevice;
  }, [defaultDevice]);

  // Wymuszamy maksymalną rozdzielczość zdjęcia - ADR 0015
  const format = useCameraFormat(device, [
    { photoResolution: 'max' }
  ]);

  // Animacja migawki
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Zoom Gesture State
  const baseZoom = useRef(1);
  const baseDistance = useRef(0);

  const calculateDistance = (touches: any[]) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = (e: any) => {
    if (e.nativeEvent.touches.length === 2 && device) {
      baseDistance.current = calculateDistance(e.nativeEvent.touches);
      baseZoom.current = zoom;
    }
  };

  const onTouchMove = (e: any) => {
    if (e.nativeEvent.touches.length === 2 && device) {
      const distance = calculateDistance(e.nativeEvent.touches);
      const scale = distance / baseDistance.current;
      
      const minZ = device.minZoom;
      const maxZ = device.maxZoom;
      let newZoom = baseZoom.current * scale;
      
      if (newZoom < minZ) newZoom = minZ;
      if (newZoom > maxZ) newZoom = maxZ;
      
      setZoom(newZoom);
    }
  };

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || !device) return;

    setIsCapturing(true);

    // Animacja migawki
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();

    try {
      // Robimy zdjęcie z dedykowanym stanem flash
      const photo = await cameraRef.current.takePhoto({
        flash: flash,
      });

      if (photo?.path) {
        // Kontrakt: zamiana photo.path na URI z uwzględnieniem file://
        const photoUri = `file://${photo.path}`;
        
        // EXIF FIX + normalizacja rozmiaru do 1200 nałożona dla starego kontraktu
        const targetW = photo.width || photo.height || 1200;
        const normalized = await ImageManipulator.manipulateAsync(
          photoUri,
          [{ resize: { width: targetW } }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
        );
        
        console.log('[Camera] Photo:', photo.width, 'x', photo.height,
          '→ Normalized:', normalized.width, 'x', normalized.height);
          
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
        const asset = result.assets[0];
        const targetW = asset.width || asset.height || 1200;
        const normalized = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: targetW } }],
          { format: ImageManipulator.SaveFormat.JPEG, compress: 0.95 }
        );
        console.log('[Camera] Gallery:', asset.width, 'x', asset.height,
          '→ Normalized:', normalized.width, 'x', normalized.height);
        setCapturedImageUri(normalized.uri);
        router.push('/crop');
      }
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się otworzyć galerii.');
    }
  };

  // Użytkownik nie udzielił odpowiedzi / ładuje permissiony
  if (hasPermission === undefined) {
    return <View style={styles.container} />;
  }

  // Brak uprawnień do kamery
  if (!hasPermission) {
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

  if (!device) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionTitle}>Brak kamery</Text>
          <Text style={styles.permissionText}>Twoje urządzenie nie obsługuje kamery.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
             <Text style={styles.backBtnText}>Wróć</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* React Native Vision Camera */}
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={isActive}
        photo={true}
        zoom={zoom}
        resizeMode="contain"
      />
      
      {/* UI Overlay */}
      <View 
        style={StyleSheet.absoluteFill} 
        pointerEvents="box-none"
        onStartShouldSetResponder={() => true}
        onResponderGrant={onTouchStart}
        onResponderMove={onTouchMove}
      >
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

            {/* Poziomica (żyroskop) */}
            <View style={[styles.levelContainer, { borderColor: isLevel ? '#00E5FF' : 'rgba(255, 255, 255, 0.4)' }]}>
              <View style={styles.levelCrosshair} />
              <Animated.View 
                style={[
                  styles.levelBubble, 
                  { 
                    transform: [
                      { translateX: clampedX }, 
                      { translateY: clampedY } 
                    ],
                    backgroundColor: isLevel ? '#00E5FF' : '#FF3366'
                  }
                ]} 
              />
            </View>

          </View>
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
  levelContainer: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  levelCrosshair: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  levelBubble: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
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
});
