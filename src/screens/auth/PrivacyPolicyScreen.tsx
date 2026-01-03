import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function PrivacyPolicyScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Last updated: 2026-01-01</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What We Collect</Text>
          <Text style={styles.sectionBody}>
            We collect parent account details, child profile basics (name, age, reading level), and
            recipe data you import or create. We also collect device diagnostics and usage events to
            improve the app.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How We Use Data</Text>
          <Text style={styles.sectionBody}>
            Data is used to provide personalized recipe experiences, save your family profiles, and
            keep cooking progress in sync across devices. We do not sell personal data.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>COPPA Notice</Text>
          <Text style={styles.sectionBody}>
            KidChef is designed for families. Parent consent is required before collecting any data
            from children under 13. Parents can review or delete child data at any time.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Retention</Text>
          <Text style={styles.sectionBody}>
            We retain account and recipe data while your account is active. You can request data
            deletion by contacting support.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <Text style={styles.sectionBody}>
            Questions? Email the KidChef support team for privacy requests and data questions.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  updated: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 20,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
});
