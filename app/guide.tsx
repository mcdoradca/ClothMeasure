// app/guide.tsx — Przewodnik użytkownika
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Platform, Dimensions, Image,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_W } = Dimensions.get('window');

const STEPS = [
  {
    num: '01',
    icon: '🖨️',
    title: 'Wydrukuj marker ArUco',
    desc: 'Wydrukuj marker kalibracyjny w rozmiarze 10×10 cm na zwykłej drukarce. Możesz też użyć karty kredytowej jako alternatywy (wybierz odpowiednią opcję w ustawieniach).',
    tip: 'Marker musi mieć dokładnie 10×10 cm. Sprawdź skalę wydruku przed użyciem.',
    tipType: 'important',
  },
  {
    num: '02',
    icon: '👕',
    title: 'Połóż ubranie na płaskiej powierzchni',
    desc: 'Rozłóż ubranie na podłodze, stole lub łóżku. Powierzchnia powinna być jak najbardziej kontrastowa względem koloru ubrania — ciemne ubranie na jasnym tle lub odwrotnie.',
    tip: 'Unikaj zmarszczek i zagięć — wpływają na dokładność pomiaru.',
    tipType: 'tip',
  },
  {
    num: '03',
    icon: '🎯',
    title: 'Umieść wzorzec kalibracyjny',
    desc: 'Połóż wydrukowany marker ArUco (lub kartę) obok ubrania na tej samej płaszczyźnie, albo bezpośrednio na ubraniu. Ważne, by leżał możliwie płasko i był w całości widoczny.',
    tip: 'Marker może leżeć obok lub na ubraniu. Unikaj zagięć materiału pod nim.',
    tipType: 'warning',
  },
  {
    num: '04',
    icon: '📸',
    title: 'Zrób zdjęcie z góry',
    desc: 'Ustaw telefon pionowo nad ubraniem i zrób zdjęcie. Aparat powinien być równoległy do podłogi. Unikaj kąta — im bardziej prostopadle, tym lepszy wynik.',
    tip: 'Optymalna odległość: 60–100 cm. Całe ubranie i marker muszą być widoczne.',
    tipType: 'tip',
  },
  {
    num: '05',
    icon: '📐',
    title: 'Aplikacja mierzy automatycznie',
    desc: 'System wykrywa marker lub kartę → przelicza skalę i perspektywę przestrzeni → przetwarza wymiary. Cały proces detekcji wzorca przebiega automatycznie w ułamku sekundy.',
    tip: 'Dbaj o dobre oświetlenie, aby wzorzec (marker/karta) wyraźnie odcinał się od tła.',
    tipType: 'tip',
  },
];

const FAQ = [
  {
    q: 'Dlaczego marker jest obowiązkowy?',
    a: 'Aparat telefonu nie wie, jak duże jest zdjęcie w świecie rzeczywistym. Marker o znanych wymiarach (10 cm) służy jako liniał kalibracyjny — bez niego aplikacja nie może przeliczyć pikseli na centymetry.',
  },
  {
    q: 'Co jeśli nie mam drukarki?',
    a: 'W ustawieniach na ekranie głównym możesz włączyć tryb "Karta Kredytowa" (8,56 × 5,4 cm). Najlepiej użyć strony bez tłoczonych danych i wzorów (pustej) lub specjalnej "karty z pakietu Premium", aby ułatwić detekcję wizyjną gładkiego prostokąta.',
  },
  {
    q: 'Dlaczego pomiary są niedokładne?',
    a: 'Najczęstsze przyczyny: kąt kamery (nie fotografujesz prostopadle), zagniecione ubranie, słabe oświetlenie, marker nie leży na tej samej płaszczyźnie co ubranie.',
  },
  {
    q: 'Jakie typy ubrań są obsługiwane?',
    a: 'Aplikacja obsługuje: koszule, t-shirty, spodnie, sukienki, kurtki, szorty i spódnice. Typ jest wykrywany automatycznie na podstawie proporcji wykrytego kształtu.',
  },
];

export default function GuideScreen() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0A1A', '#0D1B3E', '#0A0A1A']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Jak używać ClothMeasure</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <View style={styles.intro}>
          <Text style={styles.introTitle}>Przewodnik krok po kroku</Text>
          <Text style={styles.introText}>
            Aby uzyskać pomiary z dokładnością do 1 cm, postępuj zgodnie z poniższymi krokami.
          </Text>
        </View>

        {/* Kroki */}
        {STEPS.map((step, index) => (
          <View key={step.num} style={styles.stepCard}>
            <View style={styles.stepNumContainer}>
              <LinearGradient
                colors={['#00E5FF', '#7B2FFF']}
                style={styles.stepNumGradient}
              >
                <Text style={styles.stepNum}>{step.num}</Text>
              </LinearGradient>
              {index < STEPS.length - 1 && <View style={styles.stepConnector} />}
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepIcon}>{step.icon}</Text>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepDesc}>{step.desc}</Text>
              <View style={[
                styles.tipBox,
                step.tipType === 'warning' ? styles.tipWarning :
                step.tipType === 'important' ? styles.tipImportant : styles.tipNormal,
              ]}>
                <Ionicons
                  name={
                    step.tipType === 'warning' ? 'warning-outline' :
                    step.tipType === 'important' ? 'information-circle-outline' :
                    'bulb-outline'
                  }
                  size={16}
                  color={
                    step.tipType === 'warning' ? '#FFD700' :
                    step.tipType === 'important' ? '#00E5FF' :
                    '#69FF47'
                  }
                />
                <Text style={styles.tipText}>{step.tip}</Text>
              </View>
            </View>
          </View>
        ))}

        {/* Marker do wydruku (SVG inline) */}
        <View style={styles.markerSection}>
          <Text style={styles.sectionTitle}>Marker do wydruku</Text>
          <Text style={styles.markerDesc}>
            Wydrukuj poniższy marker w rozmiarze 10×10 cm (100% skali, bez skalowania przez drukarkę).
          </Text>
          <View style={styles.markerContainer}>
            <ArucoMarkerSVG />
            <Text style={styles.markerCaption}>ArUco Marker ID:1 — 10×10 cm</Text>
          </View>
        </View>

        {/* FAQ */}
        <Text style={styles.sectionTitle}>Najczęstsze pytania</Text>
        {FAQ.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.faqCard}
            onPress={() => setExpandedFaq(expandedFaq === index ? null : index)}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.faqQ}>{item.q}</Text>
              <Ionicons
                name={expandedFaq === index ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#8899AA"
              />
            </View>
            {expandedFaq === index && (
              <Text style={styles.faqA}>{item.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        {/* CTA */}
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => router.push('/camera')}
        >
          <LinearGradient
            colors={['#00E5FF', '#0066FF', '#7B2FFF']}
            style={styles.ctaGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Ionicons name="camera" size={22} color="white" />
            <Text style={styles.ctaText}>Gotowe! Zmierz ubranie</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

/**
 * Marker ArUco 4x4 ID:1 wyświetlany jako prosty kwadratowy wzór
 * W rzeczywistej aplikacji byłby generowany z biblioteki aruco-generator
 */
function ArucoMarkerSVG() {
  const size = SCREEN_W - 80;
  // Wzór binarny 6x6 (border=czarne + 4x4 dane)
  const pattern = [
    [1,1,1,1,1,1],
    [1,0,1,0,0,1],
    [1,0,0,1,0,1],
    [1,1,0,0,1,1],
    [1,0,0,1,0,1],
    [1,1,1,1,1,1],
  ];

  const cellSize = size / 6;

  const cells = pattern.flatMap((row, r) =>
    row.map((cell, c) =>
      cell === 1
        ? `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`
        : ''
    )
  ).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="white"/>
    ${cells}
  </svg>`;

  const { SvgXml } = require('react-native-svg');
  return (
    <View style={{ backgroundColor: 'white', padding: 8, borderRadius: 8 }}>
      <SvgXml xml={svg} width={size - 16} height={size - 16} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A1A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 55 : 40,
    paddingHorizontal: 16, paddingBottom: 14,
    backgroundColor: 'rgba(10,10,26,0.95)',
    borderBottomWidth: 1, borderBottomColor: '#1E2A3A',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: 'white', flex: 1, textAlign: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  intro: { marginBottom: 28 },
  introTitle: { fontSize: 22, fontWeight: '800', color: 'white', marginBottom: 8 },
  introText: { fontSize: 14, color: '#8899AA', lineHeight: 22 },
  stepCard: {
    flexDirection: 'row', gap: 14, marginBottom: 0,
  },
  stepNumContainer: { alignItems: 'center', width: 36 },
  stepNumGradient: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNum: { fontSize: 13, fontWeight: '900', color: 'white' },
  stepConnector: {
    width: 2, flex: 1, backgroundColor: '#1E3050',
    marginVertical: 6, minHeight: 20,
  },
  stepContent: {
    flex: 1, paddingBottom: 20,
  },
  stepIcon: { fontSize: 24, marginBottom: 6 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: 'white', marginBottom: 6 },
  stepDesc: { fontSize: 14, color: '#8899AA', lineHeight: 21, marginBottom: 10 },
  tipBox: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    padding: 10, borderRadius: 10, borderWidth: 1,
  },
  tipNormal: { backgroundColor: '#001A0A', borderColor: '#69FF4720' },
  tipWarning: { backgroundColor: '#1A1400', borderColor: '#FFD70020' },
  tipImportant: { backgroundColor: '#001020', borderColor: '#00E5FF20' },
  tipText: { flex: 1, fontSize: 12, color: '#99AABB', lineHeight: 18 },
  markerSection: { marginBottom: 28 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: 'white', marginBottom: 12 },
  markerDesc: { fontSize: 13, color: '#8899AA', lineHeight: 20, marginBottom: 14 },
  markerContainer: { alignItems: 'center', gap: 10 },
  markerCaption: { fontSize: 12, color: '#667788' },
  faqCard: {
    backgroundColor: '#111828', borderRadius: 12,
    borderWidth: 1, borderColor: '#1E2A3A',
    padding: 14, marginBottom: 8,
  },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: 'white', lineHeight: 20 },
  faqA: { fontSize: 13, color: '#8899AA', lineHeight: 20, marginTop: 10 },
  ctaBtn: { marginTop: 28, borderRadius: 16, overflow: 'hidden' },
  ctaGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 18,
  },
  ctaText: { fontSize: 18, fontWeight: '800', color: 'white' },
});
