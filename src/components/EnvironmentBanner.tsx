import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { getEnvironmentInfo, featureFlags } from '../utils/environment';

interface EnvironmentBannerProps {
  onPress?: () => void;
  showDetails?: boolean;
}

export const EnvironmentBanner: React.FC<EnvironmentBannerProps> = ({
  onPress,
  showDetails = false
}) => {
  const envInfo = getEnvironmentInfo();

  // Don't show banner in production unless explicitly enabled
  if (envInfo.isProd && !featureFlags.showBetaBadge) {
    return null;
  }

  const getBannerText = () => {
    if (envInfo.isDev) return '🔧 Development';
    if (envInfo.isStaging) return '🧪 Beta Version';
    return '🚀 Production';
  };

  const getBannerIcon = () => {
    if (envInfo.isDev) return '🔧';
    if (envInfo.isStaging) return '🧪';
    return '🚀';
  };

  const getBackgroundColor = () => {
    if (envInfo.isDev) return '#fef3c7'; // Light amber
    if (envInfo.isStaging) return '#dbeafe'; // Light blue
    return '#d1fae5'; // Light green
  };

  const getTextColor = () => {
    if (envInfo.isDev) return '#92400e'; // Dark amber
    if (envInfo.isStaging) return '#1e40af'; // Dark blue
    return '#065f46'; // Dark green
  };

  const getBorderColor = () => {
    if (envInfo.isDev) return '#f59e0b'; // Amber
    if (envInfo.isStaging) return '#3b82f6'; // Blue
    return '#10b981'; // Green
  };

  return (
    <TouchableOpacity
      style={[
        styles.banner,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
        }
      ]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <Text style={[styles.bannerIcon]}>{getBannerIcon()}</Text>
      <View style={styles.bannerContent}>
        <Text style={[styles.bannerText, { color: getTextColor() }]}>
          {getBannerText()}
        </Text>
        {showDetails && (
          <Text style={[styles.bannerDetails, { color: getTextColor() }]}>
            Tap for debug info
          </Text>
        )}
      </View>
      {envInfo.isStaging && (
        <Text style={[styles.shakeHint, { color: getTextColor() }]}>
          Shake to report bugs
        </Text>
      )}
    </TouchableOpacity>
  );
};

export const EnvironmentDebugModal: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const envInfo = getEnvironmentInfo();

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Environment Debug Info</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.debugSection}>
          <Text style={styles.debugLabel}>Environment:</Text>
          <Text style={styles.debugValue}>{envInfo.environment}</Text>
        </View>

        <View style={styles.debugSection}>
          <Text style={styles.debugLabel}>App Variant:</Text>
          <Text style={styles.debugValue}>{envInfo.variant}</Text>
        </View>

        <View style={styles.debugSection}>
          <Text style={styles.debugLabel}>Display Name:</Text>
          <Text style={styles.debugValue}>{envInfo.displayName}</Text>
        </View>

        <View style={styles.debugSection}>
          <Text style={styles.debugLabel}>Feature Flags:</Text>
          <View style={styles.flagsList}>
            {Object.entries(featureFlags).map(([key, value]) => (
              <Text key={key} style={[styles.flagItem, { color: value ? '#10b981' : '#6b7280' }]}>
                {key}: {value ? '✓' : '✗'}
              </Text>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.closeModalButton} onPress={onClose}>
          <Text style={styles.closeModalButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  bannerIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  bannerContent: {
    flex: 1,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  bannerDetails: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.8,
  },
  shakeHint: {
    fontSize: 12,
    fontStyle: 'italic',
    opacity: 0.8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    margin: 20,
    maxWidth: 400,
    width: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: 'bold',
  },
  debugSection: {
    marginBottom: 16,
  },
  debugLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  debugValue: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  flagsList: {
    marginTop: 4,
  },
  flagItem: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginVertical: 1,
  },
  closeModalButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  closeModalButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});