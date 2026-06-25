// app/index.tsx — HomeScreen
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  ScrollView,
  Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { getGarmentName } from '../src/algorithms/annotation';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function HomeScreen() {
  const history = useMeasurementStore((s) => s.history);

  // Animacje
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();

    // Pulsowanie przycisku CTA
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <View style={styles.container}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#0A0A1A', '#0D1B3E', '#0A0A1A']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
      />

      {/* Glowing orb dekoracja */}
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          style={[
            styles.header,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={['#00E5FF', '#7B2FFF']}
              style={styles.logoGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="scan-outline" size={32} color="white" />
            </LinearGradient>
          </View>
          <Text style={styles.appName}>ClothMeasure</Text>
          <Text style={styles.tagline}>Precyzyjny pomiar ubrań z aparatu</Text>
        </Animated.View>

        {/* CTA Button */}
        <Animated.View
          style={[
            styles.ctaWrapper,
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: pulseAnim },
              ],
            },
          ]}
        >
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/camera')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#00E5FF', '#0066FF', '#7B2FFF']}
              style={styles.ctaGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="camera" size={28} color="white" />
              <Text style={styles.ctaText}>Zmierz ubranie</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Feature cards */}
        <Animated.View
          style={[styles.featuresRow, { opacity: fadeAnim }]}
        >
          <FeatureCard
            icon="resize-outline"
            title="Precyzja 1 cm"
            desc="Marker kalibracyjny"
            color="#00E5FF"
          />
          <FeatureCard
            icon="scan-sharp"
            title="Auto-wykrycie"
            desc="Canny + ArUco"
            color="#69FF47"
          />
          <FeatureCard
            icon="shirt-outline"
            title="Wszystkie typy"
            desc="6 kategorii"
            color="#C77DFF"
          />
        </Animated.View>

        {/* Ostatnie pomiary */}
        {history.length > 0 && (
          <Animated.View style={[styles.historySection, { opacity: fadeAnim }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ostatnie pomiary</Text>
              <TouchableOpacity onPress={() => router.push('/history')}>
                <Text style={styles.sectionLink}>Zobacz wszystkie →</Text>
              </TouchableOpacity>
            </View>

            {history.slice(0, 3).map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <View style={styles.historyIcon}>
                  <Ionicons name="shirt-outline" size={20} color="#00E5FF" />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyType}>
                    {entry.garmentName || getGarmentName(entry.measurements.garmentType)}
                  </Text>
                  <Text style={styles.historyDims}>
                    {entry.measurements.width} × {entry.measurements.length} cm
                  </Text>
                </View>
                <Text style={styles.historyDate}>
                  {new Date(entry.timestamp).toLocaleDateString('pl-PL')}
                </Text>
              </View>
            ))}
          </Animated.View>
        )}

        {/* Guide button */}
        <TouchableOpacity
          style={styles.guideBtn}
          onPress={() => router.push('/guide')}
        >
          <Ionicons name="help-circle-outline" size={18} color="#888" />
          <Text style={styles.guideBtnText}>Jak używać aplikacji?</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
  color,
}: {
  icon: string;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <View style={[styles.featureCard, { borderColor: color + '30' }]}>
      <Ionicons name={icon as any} size={22} color={color} />
      <Text style={[styles.featureTitle, { color }]}>{title}</Text>
      <Text style={styles.featureDesc}>{desc}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A1A',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  orb1: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: '#00E5FF15',
    top: -60,
    right: -60,
  },
  orb2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#7B2FFF10',
    bottom: 100,
    left: -80,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logoGradient: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 15,
    color: '#8899AA',
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaWrapper: {
    marginBottom: 32,
  },
  ctaButton: {
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  ctaText: {
    fontSize: 20,
    fontWeight: '800',
    color: 'white',
    letterSpacing: 0.3,
  },
  featuresRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
  },
  featureCard: {
    flex: 1,
    backgroundColor: '#111828',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
    gap: 6,
  },
  featureTitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  featureDesc: {
    fontSize: 10,
    color: '#556677',
    textAlign: 'center',
  },
  historySection: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionLink: {
    fontSize: 13,
    color: '#00E5FF',
    fontWeight: '600',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111828',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1E2A3A',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#00E5FF15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  historyInfo: {
    flex: 1,
  },
  historyType: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  historyDims: {
    fontSize: 13,
    color: '#8899AA',
  },
  historyDate: {
    fontSize: 12,
    color: '#556677',
  },
  guideBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  guideBtnText: {
    fontSize: 14,
    color: '#667788',
  },
});
