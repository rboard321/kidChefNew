import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TermsOfServiceScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Terms of Service</Text>
        <Text style={styles.updated}>Last updated: 2026-01-01</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eligibility</Text>
          <Text style={styles.sectionBody}>
            KidChef accounts must be created by parents or legal guardians. Children use the app
            only under adult supervision.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account Responsibilities</Text>
          <Text style={styles.sectionBody}>
            Keep your login credentials secure and provide accurate profile information. You are
            responsible for activity within your family account.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Content</Text>
          <Text style={styles.sectionBody}>
            You own the recipes and notes you submit. By using the service, you allow KidChef to
            store and display that content within your account.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acceptable Use</Text>
          <Text style={styles.sectionBody}>
            Do not misuse the service, attempt to access other users' data, or submit harmful
            content. We may suspend accounts that violate these terms.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Disclaimers</Text>
          <Text style={styles.sectionBody}>
            KidChef provides cooking guidance but does not replace adult supervision. Use common
            safety practices when cooking with children.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <Text style={styles.sectionBody}>
            Reach out to the KidChef support team with questions about these terms.
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
