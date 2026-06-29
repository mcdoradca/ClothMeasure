// app/processing.tsx — ProcessingScreen
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { processClothingImage } from '../src/algorithms/imageProcessor';
import { SentinelLogger } from '../src/utils/logger';

const { width: SCREEN_W } = Dimensions.get('window');

const STEPS = [
  { id: 'prepare', label: 'Przygotowywanie obrazu', icon: '🖼️' },
  { id: 'pixels', label: 'Odczyt pikseli', icon: '📊' },
  { id: 'aruco', label: 'Detekcja markera ArUco', icon: '🎯' },
  { id: 'manual_ui', label: 'Inicjalizacja środowiska manualnego', icon: '🛠️' },
];

export default function ProcessingScreen() {
  const capturedImageUri = useMeasurementStore((s) => s.capturedImageUri);
  const setCurrentResult = useMeasurementStore((s) => s.setCurrentResult);
  const setProcessingProgress = useMeasurementStore((s) => s.setProcessingProgress);
  const processingProgress = useMeasurementStore((s) => s.processingProgress);
  const processingStep = useMeasurementStore((s) => s.processingStep);

  const rotateAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animacja obrotu
    const rotation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 1500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    rotation.start();

    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    return () => rotation.stop();
  }, []);

  useEffect(() => {
    // Animacja paska postępu
    Animated.timing(progressAnim, {
      toValue: processingProgress / 100,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [processingProgress]);

  useEffect(() => {
    if (!capturedImageUri) {
      router.replace('/');
      return;
    }

    startProcessing();
  }, []);

  const startProcessing = async () => {
    if (!capturedImageUri) return;
    SentinelLogger.start('Processing', 'startProcessing');

    try {
      const result = await processClothingImage(
        capturedImageUri,
        (step, percent) => {
          setProcessingProgress(percent, step);
        }
      );

      setCurrentResult(result);
      console.log('====== DIAGNOSTYKA ======');
      console.log('SCREEN_W (Telefon):', SCREEN_W);
      console.log('pixelPerCm:', result.pixelPerCm);
      console.log('imageWidth (Zdjęcie):', result.imageWidth);
      console.log('imageHeight (Zdjęcie):', result.imageHeight);
      console.log('=========================');
      SentinelLogger.success('Processing', 'startProcessing', { markerFound: result.markerFound });

      // Brak sztucznych opóźnień (placebo)
      router.replace('/result');
    } catch (error) {
      SentinelLogger.error('Processing', 'startProcessing', error);
      router.replace('/result');
    }
  };

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const activeStepIndex = Math.floor((processingProgress / 100) * STEPS.length);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <LinearGradient
        colors={['#0A0A1A', '#0D1B3E', '#0A0A1A']}
        style={StyleSheet.absoluteFill}
      />

      {/* Spinner */}
      <Animated.View style={[styles.spinner, { transform: [{ rotate: spin }] }]}>
        <LinearGradient
          colors={['#00E5FF', '#7B2FFF', '#00E5FF']}
          style={styles.spinnerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      </Animated.View>

      {/* Icon center */}
      <View style={styles.iconCenter}>
        <Text style={styles.processingIcon}>📐</Text>
      </View>

      {/* Tytuł */}
      <Text style={styles.title}>Analiza ubrania</Text>
      <Text style={styles.subtitle}>{processingStep || 'Inicjalizacja…'}</Text>

      {/* Pasek postępu */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View
            style={[styles.progressFill, { width: progressWidth }]}
          >
            <LinearGradient
              colors={['#00E5FF', '#7B2FFF']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </Animated.View>
        </View>
        <Text style={styles.progressText}>{processingProgress}%</Text>
      </View>

      {/* Kroki */}
      <View style={styles.stepsContainer}>
        {STEPS.map((step, index) => {
          const isDone = index < activeStepIndex;
          const isActive = index === activeStepIndex;
          return (
            <View
              key={step.id}
              style={[
                styles.step,
                isDone && styles.stepDone,
                isActive && styles.stepActive,
              ]}
            >
              <Text style={styles.stepIcon}>{step.icon}</Text>
              <Text
                style={[
                  styles.stepLabel,
                  isDone && styles.stepLabelDone,
                  isActive && styles.stepLabelActive,
                ]}
              >
                {step.label}
              </Text>
              {isDone && <Text style={styles.stepCheck}>✓</Text>}
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0A1A',
    paddingHorizontal: 32,
  },
  spinner: {
    width: 100,
    height: 100,
    borderRadius: 50,
    position: 'absolute',
    top: '25%',
  },
  spinnerGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  iconCenter: {
    position: 'absolute',
    top: '25%',
    marginTop: 0,
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: 'white',
    marginTop: 80,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8899AA',
    marginBottom: 32,
    textAlign: 'center',
    minHeight: 20,
  },
  progressContainer: {
    width: '100%',
    marginBottom: 36,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#1E2A3A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: '#667788',
    textAlign: 'right',
  },
  stepsContainer: {
    width: '100%',
    gap: 8,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#0D1220',
    borderWidth: 1,
    borderColor: '#1A2030',
  },
  stepDone: {
    borderColor: '#00E5FF30',
    backgroundColor: '#001A2A',
  },
  stepActive: {
    borderColor: '#00E5FF',
    backgroundColor: '#001A2A',
  },
  stepIcon: {
    fontSize: 16,
  },
  stepLabel: {
    flex: 1,
    fontSize: 13,
    color: '#445566',
    fontWeight: '500',
  },
  stepLabelDone: {
    color: '#667788',
  },
  stepLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  stepCheck: {
    fontSize: 14,
    color: '#00E5FF',
    fontWeight: '700',
  },
});
