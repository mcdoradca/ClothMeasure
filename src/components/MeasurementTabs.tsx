import React from 'react';
import { ScrollView, TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface MeasurementTabsProps {
  lines: { id: string; label: string; color: string; isMeasured: boolean }[];
  activeId: string;
  onSelect: (id: string) => void;
  onSelectCustom: () => void;
}

export function MeasurementTabs({
  lines,
  activeId,
  onSelect,
  onSelectCustom
}: MeasurementTabsProps) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {lines.map((line) => {
          const isActive = line.id === activeId;
          return (
            <TouchableOpacity
              key={line.id}
              style={[
                styles.tab,
                isActive && { backgroundColor: line.color, borderColor: line.color }
              ]}
              onPress={() => onSelect(line.id)}
            >
              <Text style={[styles.label, isActive && styles.activeLabel]}>
                {line.label}
              </Text>
              {line.isMeasured && (
                <Ionicons 
                  name="checkmark-circle" 
                  size={16} 
                  color={isActive ? '#FFFFFF' : line.color} 
                  style={{ marginLeft: 6 }} 
                />
              )}
            </TouchableOpacity>
          );
        })}
        
        <TouchableOpacity
          style={[styles.tab, styles.customTab, activeId === 'custom' && styles.customActiveTab]}
          onPress={onSelectCustom}
        >
          <Text style={[styles.label, activeId === 'custom' && styles.activeLabel]}>
            + Dowolny pomiar
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  scrollContent: {
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#f5f5f5',
    marginRight: 10,
  },
  label: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  activeLabel: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  customTab: {
    borderColor: '#007AFF',
    backgroundColor: '#E5F1FF',
  },
  customActiveTab: {
    backgroundColor: '#007AFF',
  }
});
