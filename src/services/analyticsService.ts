import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { auth } from './firebase';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import { Platform } from 'react-native';

// Analytics interfaces
export interface UserSession {
  sessionId: string;
  startTime: number;
  endTime?: number;
  screenViews: ScreenView[];
  actions: UserAction[];
  deviceInfo: any;
  performance: PerformanceData;
}

export interface ScreenView {
  screen: string;
  timestamp: number;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface UserAction {
  action: string;
  screen: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface PerformanceData {
  appStartup?: number;
  screenLoads: Record<string, number>;
  apiResponses: Record<string, number>;
  memoryUsage?: number;
  errors: number;
  crashes: number;
}

export interface AnalyticsEvent {
  eventType: 'user_action' | 'system_event' | 'business_event' | 'performance';
  eventName: string;
  properties: Record<string, any>;
  timestamp?: number;
  sessionId?: string;
  screen?: string;
}

class AnalyticsService {
  private currentSession: UserSession | null = null;
  private sessionStartTime: number = Date.now();
  private pendingEvents: AnalyticsEvent[] = [];
  private performanceMetrics: PerformanceData = {
    screenLoads: {},
    apiResponses: {},
    errors: 0,
    crashes: 0
  };

  constructor() {
    this.initializeSession();
  }

  // Initialize a new user session
  private async initializeSession() {
    try {
      const deviceInfo = await this.getDeviceInfo();

      this.currentSession = {
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        startTime: this.sessionStartTime,
        screenViews: [],
        actions: [],
        deviceInfo,
        performance: this.performanceMetrics
      };

      if (__DEV__) {
        console.log(`📊 Analytics session started: ${this.currentSession.sessionId}`);
      }
    } catch (error) {
      console.warn('Failed to initialize analytics session:', error);
    }
  }

  // Get comprehensive device information
  private async getDeviceInfo() {
    try {
      return {
        platform: Platform.OS,
        osVersion: Platform.Version?.toString() || Device.osVersion || 'unknown',
        appVersion: Application.nativeApplicationVersion || '1.0.0-beta',
        deviceModel: Device.modelName || 'unknown',
        deviceBrand: Device.brand || 'unknown',
        deviceType: Device.deviceType || 'unknown',
        isDevice: Device.isDevice,
        buildVersion: Application.nativeBuildVersion || 'unknown',
        installationId: Application.applicationId || 'unknown'
      };
    } catch (error) {
      console.warn('Failed to get device info:', error);
      return {
        platform: Platform.OS,
        appVersion: '1.0.0-beta',
        deviceModel: 'unknown'
      };
    }
  }

  // Track screen views
  trackScreenView(screen: string, metadata?: Record<string, any>) {
    const timestamp = Date.now();

    if (this.currentSession) {
      // End previous screen view if exists
      const lastScreenView = this.currentSession.screenViews[this.currentSession.screenViews.length - 1];
      if (lastScreenView && !lastScreenView.duration) {
        lastScreenView.duration = timestamp - lastScreenView.timestamp;
      }

      // Add new screen view
      this.currentSession.screenViews.push({
        screen,
        timestamp,
        metadata
      });
    }

    // Also track as a generic analytics event
    this.trackEvent({
      eventType: 'user_action',
      eventName: 'screen_view',
      properties: {
        screen,
        ...metadata
      }
    });
  }

  // Track user actions
  trackAction(action: string, screen: string, metadata?: Record<string, any>) {
    const timestamp = Date.now();

    if (this.currentSession) {
      this.currentSession.actions.push({
        action,
        screen,
        timestamp,
        metadata
      });
    }

    this.trackEvent({
      eventType: 'user_action',
      eventName: action,
      properties: {
        screen,
        ...metadata
      },
      screen
    });
  }

  // Track performance metrics
  trackPerformanceMetric(metricType: string, value: number, screen?: string, additionalData?: Record<string, any>) {
    const performanceEvent = {
      metricType,
      value,
      screen: screen || 'unknown',
      action: 'performance_tracking',
      timestamp: Date.now(),
      deviceInfo: this.currentSession?.deviceInfo,
      additionalData
    };

    // Update local performance data
    if (this.currentSession) {
      switch (metricType) {
        case 'app_startup':
          this.currentSession.performance.appStartup = value;
          break;
        case 'screen_load':
          this.currentSession.performance.screenLoads[screen || 'unknown'] = value;
          break;
        case 'api_response':
          this.currentSession.performance.apiResponses[additionalData?.endpoint || 'unknown'] = value;
          break;
        case 'memory_usage':
          this.currentSession.performance.memoryUsage = value;
          break;
        case 'error':
          this.currentSession.performance.errors += 1;
          break;
        case 'crash':
          this.currentSession.performance.crashes += 1;
          break;
      }
    }

    // Send to Cloud Function
    this.sendPerformanceMetric(performanceEvent);
  }

  // Track generic analytics events
  trackEvent(event: AnalyticsEvent) {
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      sessionId: event.sessionId || this.currentSession?.sessionId || 'unknown',
      properties: {
        ...event.properties,
        userId: auth.currentUser?.uid,
        deviceInfo: this.currentSession?.deviceInfo
      }
    };

    this.pendingEvents.push(enrichedEvent);

    // Send immediately if online, otherwise queue for later
    if (this.pendingEvents.length >= 10) {
      this.flushEvents();
    }
  }

  // Track feature usage
  trackFeatureUsage(featureName: string, action: 'start' | 'complete' | 'cancel' | 'error', metadata?: Record<string, any>) {
    const featureUsage = {
      featureName,
      action,
      screen: metadata?.screen || 'unknown',
      timestamp: Date.now(),
      sessionId: this.currentSession?.sessionId,
      metadata
    };

    this.sendFeatureUsage(featureUsage);

    // Also track as generic event
    this.trackEvent({
      eventType: 'business_event',
      eventName: `feature_${action}`,
      properties: {
        featureName,
        ...metadata
      }
    });
  }

  // End current session
  endSession() {
    if (this.currentSession) {
      this.currentSession.endTime = Date.now();

      // End the last screen view
      const lastScreenView = this.currentSession.screenViews[this.currentSession.screenViews.length - 1];
      if (lastScreenView && !lastScreenView.duration) {
        lastScreenView.duration = this.currentSession.endTime - lastScreenView.timestamp;
      }

      this.sendUserSession(this.currentSession);

      if (__DEV__) {
        console.log(`📊 Analytics session ended: ${this.currentSession.sessionId}`);
      }

      this.currentSession = null;
    }
  }

  // Flush all pending events
  async flushEvents() {
    if (this.pendingEvents.length === 0) return;

    try {
      const eventsToSend = [...this.pendingEvents];
      this.pendingEvents = [];

      const batchTrackFunction = httpsCallable(functions, 'batchTrackAnalytics');
      const events = eventsToSend.map(event => ({
        type: 'event',
        data: event
      }));

      await batchTrackFunction({ events });

      if (__DEV__) {
        console.log(`📊 Sent ${events.length} analytics events`);
      }

    } catch (error) {
      console.error('Failed to send analytics events:', error);
      // Re-queue events for retry
      this.pendingEvents.unshift(...this.pendingEvents);
    }
  }

  // Send individual Cloud Function calls
  private async sendUserSession(session: UserSession) {
    try {
      const trackSessionFunction = httpsCallable(functions, 'trackUserSession');
      await trackSessionFunction(session);
    } catch (error) {
      console.error('Failed to send user session:', error);
    }
  }

  private async sendPerformanceMetric(metric: any) {
    try {
      const trackPerformanceFunction = httpsCallable(functions, 'trackPerformanceMetrics');
      await trackPerformanceFunction(metric);
    } catch (error) {
      console.error('Failed to send performance metric:', error);
    }
  }

  private async sendFeatureUsage(usage: any) {
    try {
      const trackFeatureFunction = httpsCallable(functions, 'trackFeatureUsage');
      await trackFeatureFunction(usage);
    } catch (error) {
      console.error('Failed to send feature usage:', error);
    }
  }

  // Get current session info
  getCurrentSession() {
    return this.currentSession;
  }

  // Get performance summary
  getPerformanceSummary() {
    return this.performanceMetrics;
  }
}

// Global analytics instance
export const analyticsService = new AnalyticsService();

// Helper functions for easy tracking
export const trackScreen = (screen: string, metadata?: Record<string, any>) => {
  analyticsService.trackScreenView(screen, metadata);
};

export const trackUserAction = (action: string, screen: string, metadata?: Record<string, any>) => {
  analyticsService.trackAction(action, screen, metadata);
};

export const trackFeature = (featureName: string, action: 'start' | 'complete' | 'cancel' | 'error', metadata?: Record<string, any>) => {
  analyticsService.trackFeatureUsage(featureName, action, metadata);
};

export const trackPerformance = (metricType: string, value: number, screen?: string, additionalData?: Record<string, any>) => {
  analyticsService.trackPerformanceMetric(metricType, value, screen, additionalData);
};

export const trackCustomEvent = (event: AnalyticsEvent) => {
  analyticsService.trackEvent(event);
};

// React Native lifecycle helpers
export const initializeAnalytics = () => {
  // Track app startup performance
  const startupTime = Date.now() - (global.appStartTime || Date.now());
  trackPerformance('app_startup', startupTime);

  if (__DEV__) {
    console.log('📊 Analytics service initialized');
  }
};

export const endAnalyticsSession = () => {
  analyticsService.endSession();
  analyticsService.flushEvents();
};