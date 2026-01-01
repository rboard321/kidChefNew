import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';

export interface FilterOption {
  id: string;
  label: string;
  emoji?: string;
  value?: any;
}

interface FilterChipsProps {
  filters: FilterOption[];
  activeFilters: string[];
  onFilterPress: (filterId: string) => void;
  kidMode?: boolean;
  style?: any;
}

export default function FilterChips({
  filters,
  activeFilters,
  onFilterPress,
  kidMode = false,
  style
}: FilterChipsProps) {
  const renderFilterChip = (filter: FilterOption) => {
    const isActive = activeFilters.includes(filter.id);

    return (
      <TouchableOpacity
        key={filter.id}
        style={[
          kidMode ? styles.kidChip : styles.parentChip,
          isActive && (kidMode ? styles.kidChipActive : styles.parentChipActive)
        ]}
        onPress={() => onFilterPress(filter.id)}
        activeOpacity={0.7}
      >
        <Text style={[
          kidMode ? styles.kidChipText : styles.parentChipText,
          isActive && (kidMode ? styles.kidChipTextActive : styles.parentChipTextActive)
        ]}>
          {filter.emoji && `${filter.emoji} `}{filter.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {filters.map(renderFilterChip)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 10,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 10,
  },

  // Parent Mode Styles
  parentChip: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  parentChipActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  parentChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  parentChipTextActive: {
    color: 'white',
    fontWeight: '600',
  },

  // Kid Mode Styles
  kidChip: {
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#bae6fd',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  kidChipActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  kidChipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
  },
  kidChipTextActive: {
    color: 'white',
    fontWeight: 'bold',
  },
});