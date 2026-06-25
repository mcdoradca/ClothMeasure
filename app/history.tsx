// app/history.tsx — HistoryScreen
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, Platform, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMeasurementStore } from '../src/stores/measurementStore';
import { getGarmentName } from '../src/algorithms/annotation';
import { HistoryEntry } from '../src/types';

const { width: SCREEN_W } = Dimensions.get('window');

function getGarmentEmoji(type: string): string {
  const e: Record<string, string> = {
    shirt:'👔', tshirt:'👕', pants:'👖', dress:'👗',
    jacket:'🧥', shorts:'🩳', skirt:'👗', unknown:'👕',
  };
  return e[type] || '👕';
}

export default function HistoryScreen() {
  const history = useMeasurementStore(s => s.history);
  const deleteHistoryEntry = useMeasurementStore(s => s.deleteHistoryEntry);
  const clearHistory = useMeasurementStore(s => s.clearHistory);

  const handleDelete = (id: string) => {
    Alert.alert('Usuń pomiar', 'Czy na pewno chcesz usunąć ten pomiar?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => deleteHistoryEntry(id) },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('Wyczyść historię', 'Usuń wszystkie zapisane pomiary?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Wyczyść', style: 'destructive', onPress: clearHistory },
    ]);
  };

  const renderItem = ({ item }: { item: HistoryEntry }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardEmoji}>{getGarmentEmoji(item.measurements.garmentType)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>
          {item.garmentName || getGarmentName(item.measurements.garmentType)}
        </Text>
        <Text style={styles.cardDims}>
          {item.measurements.width} × {item.measurements.length} cm
        </Text>
        {item.measurements.shoulder && (
          <Text style={styles.cardExtra}>Ramiona: {item.measurements.shoulder} cm</Text>
        )}
        <Text style={styles.cardDate}>
          {new Date(item.timestamp).toLocaleString('pl-PL')}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id)}
      >
        <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
      </TouchableOpacity>
    </View>
  );

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
        <Text style={styles.headerTitle}>Historia pomiarów</Text>
        {history.length > 0 ? (
          <TouchableOpacity onPress={handleClearAll}>
            <Ionicons name="trash-outline" size={22} color="#FF6B6B" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      {history.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>Brak historii</Text>
          <Text style={styles.emptyText}>Zmierz pierwsze ubranie, a pojawi się tutaj.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/camera')}>
            <Text style={styles.emptyBtnText}>Zmierz ubranie</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={styles.listCount}>{history.length} pomiarów</Text>
          }
        />
      )}
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: 'white' },
  list: { padding: 16, gap: 10 },
  listCount: { fontSize: 13, color: '#667788', marginBottom: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111828', borderRadius: 14,
    borderWidth: 1, borderColor: '#1E2A3A', padding: 14, gap: 12,
  },
  cardLeft: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: '#1E2A3A', alignItems: 'center', justifyContent: 'center',
  },
  cardEmoji: { fontSize: 24 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: 'white', marginBottom: 2 },
  cardDims: { fontSize: 14, color: '#00E5FF', fontWeight: '600', marginBottom: 2 },
  cardExtra: { fontSize: 12, color: '#8899AA', marginBottom: 2 },
  cardDate: { fontSize: 11, color: '#556677' },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#FF6B6B15', alignItems: 'center', justifyContent: 'center',
  },
  emptyState: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 22, fontWeight: '700', color: 'white' },
  emptyText: { fontSize: 14, color: '#8899AA', textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#00E5FF',
    paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#0A0A1A' },
});
