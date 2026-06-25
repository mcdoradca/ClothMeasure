// app/result.tsx — ResultScreen
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
  Alert,
  Share,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { getGarmentName } from '../src/algorithms/annotation';
import { GarmentMeasurements } from '../src/types';

const { width: SCREEN_W } = Dimensions.get('window');

export default function ResultScreen() {
  const currentResult = useMeasurementStore((s) => s.currentResult);
  const addToHistory = useMeasurementStore((s) => s.addToHistory);
  const [saved, setSaved] = useState(false);
  const [showSvgOverlay, setShowSvgOverlay] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();

    // Zapisz do historii automatycznie przy sukcesie
    if (currentResult?.success && currentResult.measurements) {
      addToHistory(currentResult);
    }
  }, []);

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

  const { measurements, imageUri, annotatedImageBase64, markerFound, processingTimeMs } =
    currentResult;

  const handleSave = async () => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(imageUri, {
          mimeType: 'image/jpeg',
          dialogTitle: 'Zapisz lub udostępnij zdjęcie',
        });
        setSaved(true);
      } else {
        Alert.alert('Błąd', 'Opcja eksportu jest niedostępna na tym urządzeniu.');
      }
    } catch (e) {
      console.error('[Result] Błąd eksportu:', e);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: formatMeasurementsText(measurements!),
        title: 'Pomiary ubrania — ClothMeasure',
      });
    } catch (e) {
      console.error('[Result] Błąd udostępniania:', e);
    }
  };

  const imageAspect = SCREEN_W / (SCREEN_W * 1.2);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A1A', '#0D1B3E', '#0A0A1A']}
        style={StyleSheet.absoluteFill}
      />

      {/* Nagłówek */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/')}>
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {currentResult.success ? 'Wyniki pomiaru' : 'Błąd pomiaru'}
        </Text>
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Ionicons name="share-outline" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Zdjęcie z adnotacjami */}
        <Animated.View
          style={[
            styles.imageContainer,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <Image
            source={{ uri: imageUri }}
            style={styles.image}
            resizeMode="contain"
          />
          {/* SVG overlay z pomiarami */}
          {showSvgOverlay && annotatedImageBase64 && annotatedImageBase64.startsWith('data:image/svg') && (
            <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
              <SvgXml
                xml={atob(annotatedImageBase64.replace('data:image/svg+xml;base64,', ''))}
                width="100%"
                height="100%"
                preserveAspectRatio="xMidYMid meet"
              />
            </View>
          )}

          {/* Toggle overlay */}
          <TouchableOpacity
            style={styles.overlayToggle}
            onPress={() => setShowSvgOverlay(!showSvgOverlay)}
          >
            <Ionicons
              name={showSvgOverlay ? 'eye' : 'eye-off'}
              size={18}
              color="white"
            />
            <Text style={styles.overlayToggleText}>
              {showSvgOverlay ? 'Ukryj pomiary' : 'Pokaż pomiary'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Status badges */}
        <Animated.View
          style={[styles.badgesRow, { opacity: fadeAnim }]}
        >
          <View style={[styles.badge, markerFound ? styles.badgeSuccess : styles.badgeWarning]}>
            <Ionicons
              name={markerFound ? 'checkmark-circle' : 'warning'}
              size={14}
              color={markerFound ? '#69FF47' : '#FFD700'}
            />
            <Text style={[styles.badgeText, { color: markerFound ? '#69FF47' : '#FFD700' }]}>
              {markerFound ? 'Marker wykryty' : 'Brak markera (szacowanie)'}
            </Text>
          </View>
          <View style={styles.badge}>
            <Ionicons name="time-outline" size={14} color="#8899AA" />
            <Text style={styles.badgeText}>{processingTimeMs} ms</Text>
          </View>
        </Animated.View>

        {/* Wyniki lub błąd */}
        {currentResult.success && measurements ? (
          <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
            {/* Typ ubrania */}
            <View style={styles.garmentTypeCard}>
              <LinearGradient
                colors={['#00E5FF20', '#7B2FFF20']}
                style={styles.garmentTypeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.garmentTypeIcon}>
                  {getGarmentEmoji(measurements.garmentType)}
                </Text>
                <View>
                  <Text style={styles.garmentTypeName}>
                    {getGarmentName(measurements.garmentType)}
                  </Text>
                  <Text style={styles.garmentTypeConfidence}>
                    Pewność: {Math.round(measurements.confidence * 100)}%
                  </Text>
                </View>
              </LinearGradient>
            </View>

            {/* Tabela pomiarów */}
            <Text style={styles.sectionTitle}>Wymiary</Text>
            <View style={styles.measurementsTable}>
              <MeasurementRow
                label="Szerokość"
                value={measurements.width}
                color="#FF9F1C"
                icon="resize-outline"
              />
              <MeasurementRow
                label="Długość"
                value={measurements.length}
                color="#C77DFF"
                icon="arrow-down-outline"
              />
              {measurements.shoulder && (
                <MeasurementRow
                  label="Ramiona"
                  value={measurements.shoulder}
                  color="#00E5FF"
                  icon="body-outline"
                />
              )}
              {measurements.chest && (
                <MeasurementRow
                  label="Klatka"
                  value={measurements.chest}
                  color="#69FF47"
                  icon="heart-outline"
                />
              )}
              {measurements.waist && (
                <MeasurementRow
                  label="Talia"
                  value={measurements.waist}
                  color="#FF6B6B"
                  icon="fitness-outline"
                />
              )}
              {measurements.hips && (
                <MeasurementRow
                  label="Biodra"
                  value={measurements.hips}
                  color="#FFD700"
                  icon="woman-outline"
                />
              )}
            </View>
          </Animated.View>
        ) : (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle-outline" size={40} color="#FF6B6B" />
            <Text style={styles.errorTitle}>Nie udało się zmierzyć</Text>
            <Text style={styles.errorText}>
              {currentResult.errorMessage || 'Nieznany błąd przetwarzania.'}
            </Text>
            <Text style={styles.errorHint}>
              💡 Wskazówki: Połóż ubranie na kontrastowym tle, dodaj oświetlenie i upewnij się że marker ArUco jest widoczny.
            </Text>
          </View>
        )}

        {/* Przyciski akcji */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={() => router.push('/camera')}
          >
            <Ionicons name="camera-outline" size={20} color="white" />
            <Text style={styles.actionBtnText}>Nowe zdjęcie</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary, saved && styles.actionBtnSaved]}
            onPress={handleSave}
            disabled={saved}
          >
            <Ionicons
              name={saved ? 'checkmark-circle' : 'save-outline'}
              size={20}
              color={saved ? '#69FF47' : '#0A0A1A'}
            />
            <Text style={[styles.actionBtnText, { color: saved ? '#69FF47' : '#0A0A1A' }]}>
              {saved ? 'Zapisano' : 'Zapisz'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function MeasurementRow({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
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

function getGarmentEmoji(type: string): string {
  const emojis: Record<string, string> = {
    shirt: '👔',
    tshirt: '👕',
    pants: '👖',
    dress: '👗',
    jacket: '🧥',
    shorts: '🩳',
    skirt: '👗',
    unknown: '👕',
  };
  return emojis[type] || '👕';
}

function formatMeasurementsText(m: GarmentMeasurements | null): string {
  if (!m) return '';
  const lines = [
    `ClothMeasure — ${getGarmentName(m.garmentType)}`,
    `Szerokość: ${m.width} cm`,
    `Długość: ${m.length} cm`,
    m.shoulder ? `Ramiona: ${m.shoulder} cm` : null,
    m.chest ? `Klatka: ${m.chest} cm` : null,
    m.waist ? `Talia: ${m.waist} cm` : null,
    m.hips ? `Biodra: ${m.hips} cm` : null,
  ].filter(Boolean);
  return lines.join('\n');
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A' },
  emptyContainer: {
    flex: 1, backgroundColor: '#0A0A1A',
    alignItems: 'center', justifyContent: 'center', gap: 16,
  },
  emptyText: { fontSize: 16, color: '#8899AA' },
  emptyLink: { fontSize: 16, color: '#00E5FF', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 55 : 40,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(10,10,26,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#1E2A3A',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: 'white' },
  shareBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center',
  },
  scroll: { paddingBottom: 40 },
  imageContainer: {
    width: SCREEN_W,
    height: SCREEN_W * 1.1,
    backgroundColor: '#050510',
    position: 'relative',
  },
  image: { width: '100%', height: '100%' },
  overlayToggle: {
    position: 'absolute', bottom: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  overlayToggleText: { fontSize: 12, color: 'white', fontWeight: '600' },
  badgesRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#111828', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#1E2A3A',
  },
  badgeSuccess: { borderColor: '#69FF4730' },
  badgeWarning: { borderColor: '#FFD70030' },
  badgeText: { fontSize: 12, color: '#8899AA', fontWeight: '500' },
  garmentTypeCard: {
    marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', marginBottom: 20,
    borderWidth: 1, borderColor: '#00E5FF30',
  },
  garmentTypeGradient: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 18,
  },
  garmentTypeIcon: { fontSize: 36 },
  garmentTypeName: { fontSize: 20, fontWeight: '800', color: 'white' },
  garmentTypeConfidence: { fontSize: 13, color: '#8899AA', marginTop: 2 },
  sectionTitle: {
    fontSize: 18, fontWeight: '700', color: 'white',
    paddingHorizontal: 16, marginBottom: 12,
  },
  measurementsTable: {
    marginHorizontal: 16, backgroundColor: '#111828',
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderColor: '#1E2A3A', marginBottom: 24,
  },
  measurementRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#1A2030',
  },
  measurementIcon: {
    width: 32, height: 32, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  measurementLabel: { flex: 1, fontSize: 15, color: '#CCDDEE', fontWeight: '500' },
  measurementValue: { fontSize: 18, fontWeight: '800' },
  errorCard: {
    marginHorizontal: 16, backgroundColor: '#1A0A0A',
    borderRadius: 16, padding: 24, alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: '#FF6B6B30', marginBottom: 24,
  },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#FF6B6B' },
  errorText: { fontSize: 14, color: '#AA8888', textAlign: 'center', lineHeight: 20 },
  errorHint: { fontSize: 13, color: '#667788', textAlign: 'center', lineHeight: 20, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginTop: 4,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16, borderRadius: 14,
  },
  actionBtnPrimary: { backgroundColor: '#00E5FF' },
  actionBtnSecondary: { backgroundColor: '#1E2A3A' },
  actionBtnSaved: { backgroundColor: '#1E2A3A' },
  actionBtnText: { fontSize: 16, fontWeight: '700', color: 'white' },
});
