import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';

interface QualityAnalytics {
  totalRecipes: number;
  averageRating: number;
  totalRatings: number;
  totalStepReports: number;
  improvementRate: number;
  qualityTrends: Array<{
    week: string;
    averageRating: number;
    ratingsCount: number;
    reportsCount: number;
  }>;
  topIssues: Array<{
    issue: string;
    count: number;
  }>;
  recipeQualityBreakdown: Array<{
    recipeId: string;
    recipeName: string;
    averageRating: number;
    totalRatings: number;
    totalReports: number;
    needsAttention: boolean;
  }>;
}

type TimeRange = 'week' | 'month' | 'quarter' | 'year';

export default function QualityAnalyticsScreen() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<QualityAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('month');

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    if (!user?.uid) return;

    setLoading(true);

    try {
      const getQualityAnalytics = httpsCallable(functions, 'getQualityAnalytics');

      const result = await getQualityAnalytics({
        timeRange
      });

      if (result.data.success) {
        setAnalytics(result.data.analytics);
      } else {
        Alert.alert('Error', 'Failed to load analytics data');
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      Alert.alert('Error', 'Failed to load analytics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRange = (range: TimeRange) => {
    switch (range) {
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'quarter': return 'Last 3 Months';
      case 'year': return 'This Year';
      default: return 'This Month';
    }
  };

  const getIssueDisplayName = (issue: string) => {
    switch (issue) {
      case 'unclear': return 'Unclear Instructions';
      case 'confusing': return 'Confusing Steps';
      case 'safety': return 'Safety Concerns';
      case 'difficulty': return 'Too Difficult';
      default: return issue.charAt(0).toUpperCase() + issue.slice(1);
    }
  };

  const renderMetricCard = (title: string, value: string | number, subtitle?: string, color = '#2563eb') => (
    <View style={[styles.metricCard, { borderLeftColor: color }]}>
      <Text style={styles.metricTitle}>{title}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading quality analytics...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!analytics) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>No analytics data available</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Quality Analytics</Text>
          <Text style={styles.subtitle}>
            Track recipe quality and improvement trends
          </Text>

          {/* Time Range Selector */}
          <View style={styles.timeRangeContainer}>
            {(['week', 'month', 'quarter', 'year'] as TimeRange[]).map((range) => (
              <TouchableOpacity
                key={range}
                style={[
                  styles.timeRangeButton,
                  timeRange === range && styles.timeRangeButtonActive
                ]}
                onPress={() => setTimeRange(range)}
              >
                <Text
                  style={[
                    styles.timeRangeButtonText,
                    timeRange === range && styles.timeRangeButtonTextActive
                  ]}
                >
                  {formatTimeRange(range)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Overview Metrics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Overview</Text>
          <View style={styles.metricsGrid}>
            {renderMetricCard('Total Recipes', analytics.totalRecipes)}
            {renderMetricCard(
              'Average Rating',
              analytics.averageRating ? `${analytics.averageRating}/5` : '—',
              `from ${analytics.totalRatings} ratings`,
              analytics.averageRating >= 4 ? '#16a34a' : analytics.averageRating >= 3 ? '#f59e0b' : '#ef4444'
            )}
            {renderMetricCard('Step Reports', analytics.totalStepReports, 'issues reported')}
            {renderMetricCard(
              'Improvement Rate',
              `${analytics.improvementRate}%`,
              'issues resolved',
              '#16a34a'
            )}
          </View>
        </View>

        {/* Top Issues */}
        {analytics.topIssues.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⚠️ Common Issues</Text>
            {analytics.topIssues.map((issue, index) => (
              <View key={index} style={styles.issueItem}>
                <View style={styles.issueInfo}>
                  <Text style={styles.issueName}>{getIssueDisplayName(issue.issue)}</Text>
                  <Text style={styles.issueCount}>{issue.count} reports</Text>
                </View>
                <View style={[styles.issueBar, { width: `${(issue.count / analytics.topIssues[0].count) * 100}%` }]} />
              </View>
            ))}
          </View>
        )}

        {/* Recipe Quality Breakdown */}
        {analytics.recipeQualityBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Recipe Quality</Text>
            {analytics.recipeQualityBreakdown.slice(0, 10).map((recipe) => (
              <View
                key={recipe.recipeId}
                style={[
                  styles.recipeItem,
                  recipe.needsAttention && styles.recipeItemAttention
                ]}
              >
                <View style={styles.recipeInfo}>
                  <Text style={styles.recipeName}>{recipe.recipeName}</Text>
                  <Text style={styles.recipeStats}>
                    {recipe.totalRatings > 0
                      ? `${recipe.averageRating.toFixed(1)}/5 (${recipe.totalRatings} ratings)`
                      : 'No ratings yet'
                    }
                    {recipe.totalReports > 0 && ` • ${recipe.totalReports} reports`}
                  </Text>
                </View>
                {recipe.needsAttention && (
                  <View style={styles.attentionBadge}>
                    <Text style={styles.attentionBadgeText}>Needs Attention</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Quality Trends */}
        {analytics.qualityTrends.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📈 Quality Trends</Text>
            <Text style={styles.sectionSubtitle}>Weekly ratings and feedback over time</Text>

            {analytics.qualityTrends.slice(-4).map((trend, index) => (
              <View key={trend.week} style={styles.trendItem}>
                <View style={styles.trendInfo}>
                  <Text style={styles.trendWeek}>
                    Week of {new Date(trend.week).toLocaleDateString()}
                  </Text>
                  <Text style={styles.trendStats}>
                    {trend.ratingsCount > 0
                      ? `Avg: ${trend.averageRating.toFixed(1)}/5 (${trend.ratingsCount} ratings)`
                      : 'No ratings'
                    }
                    {trend.reportsCount > 0 && ` • ${trend.reportsCount} reports`}
                  </Text>
                </View>
                <View
                  style={[
                    styles.trendRating,
                    {
                      backgroundColor:
                        trend.averageRating >= 4
                          ? '#dcfce7'
                          : trend.averageRating >= 3
                          ? '#fef3c7'
                          : '#fef2f2'
                    }
                  ]}
                >
                  <Text
                    style={[
                      styles.trendRatingText,
                      {
                        color:
                          trend.averageRating >= 4
                            ? '#16a34a'
                            : trend.averageRating >= 3
                            ? '#f59e0b'
                            : '#ef4444'
                      }
                    ]}
                  >
                    {trend.averageRating > 0 ? trend.averageRating.toFixed(1) : '—'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Quality analytics help improve recipe clarity for kids.
            Low-rated recipes are automatically refined to be more kid-friendly.
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
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 20,
    lineHeight: 24,
  },
  timeRangeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  timeRangeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  timeRangeButtonActive: {
    backgroundColor: '#2563eb',
  },
  timeRangeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  timeRangeButtonTextActive: {
    color: 'white',
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    padding: 20,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 15,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 15,
    lineHeight: 20,
  },
  metricsGrid: {
    gap: 15,
  },
  metricCard: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
  },
  metricTitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  metricSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
  },
  issueItem: {
    marginBottom: 15,
    position: 'relative',
  },
  issueInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  issueName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  issueCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  issueBar: {
    height: 4,
    backgroundColor: '#ef4444',
    borderRadius: 2,
  },
  recipeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 8,
  },
  recipeItemAttention: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 4,
  },
  recipeStats: {
    fontSize: 14,
    color: '#6b7280',
  },
  attentionBadge: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  attentionBadgeText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '600',
  },
  trendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 8,
  },
  trendInfo: {
    flex: 1,
  },
  trendWeek: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 2,
  },
  trendStats: {
    fontSize: 12,
    color: '#6b7280',
  },
  trendRating: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  trendRatingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});