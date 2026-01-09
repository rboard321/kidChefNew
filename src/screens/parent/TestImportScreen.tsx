import React, { useState } from 'react';
import { logger } from '../../utils/logger';
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { partialSuccessTestScenarios, testScenarioRunner, TestScenario, TestSession } from '../../utils/testScenarios';
import { useImport } from '../../contexts/ImportContext';

const TestImportScreen: React.FC = () => {
  const navigation = useNavigation();
  const { importRecipe } = useImport();
  const [testSession, setTestSession] = useState<TestSession | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const startTestSession = () => {
    const session = testScenarioRunner.startTestSession();
    setTestSession(session);
    testScenarioRunner.enableMockMode();
    Alert.alert(
      'Test Session Started',
      'Mock mode enabled. Import scenarios will now return test data instead of making real requests.',
      [{ text: 'OK' }]
    );
  };

  const endTestSession = () => {
    if (testSession) {
      const completed = testScenarioRunner.completeTestSession(testSession);
      const report = testScenarioRunner.generateTestReport(completed);
      logger.debug(report);
      Alert.alert(
        'Test Session Complete',
        `Success Rate: ${(completed.parentSuccessRate! * 100).toFixed(1)}%\n\nSee console for full report.`,
        [{ text: 'OK' }]
      );
    }
    setTestSession(null);
    testScenarioRunner.disableMockMode();
  };

  const runTestScenario = async (scenario: TestScenario) => {
    setIsRunning(true);
    const startTime = Date.now();

    try {
      Alert.alert(
        `Test: ${scenario.name}`,
        `${scenario.description}\n\nTarget: ${scenario.timerTarget}s\n\nReady to start timer?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Start Test',
            onPress: async () => {
              logger.debug(`🧪 Starting test: ${scenario.name}`);
              logger.debug(`⏱️ Timer started - target: ${scenario.timerTarget}s`);
              logger.debug(`📋 Instructions:`);
              scenario.testInstructions.forEach(instruction => {
                logger.debug(`   ${instruction}`);
              });

              // Run the mock import
              const jobId = await importRecipe(scenario.testUrl);
              logger.debug(`📦 Import job created: ${jobId}`);

              // Note: The actual review happens in RecipeReviewScreen
              // Parent will complete the flow there, timing manually
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Test Error', `Failed to run test: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const runRealWorldTest = async (url: string) => {
    setIsRunning(true);
    try {
      Alert.alert(
        'Real World Test',
        `Testing actual import from:\n${url}\n\nThis will test how the current system handles a real URL that might fail.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Test Import',
            onPress: async () => {
              testScenarioRunner.disableMockMode();
              const jobId = await importRecipe(url);
              logger.debug(`📦 Real world import job created: ${jobId}`);
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Import Error', `${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notAvailable}>
          <Text style={styles.notAvailableText}>Test screen only available in development mode</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Import UX Tests</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Test Session Control</Text>
          {!testSession ? (
            <TouchableOpacity style={styles.sessionButton} onPress={startTestSession}>
              <Text style={styles.sessionButtonText}>🧪 Start Test Session</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <Text style={styles.sessionInfo}>
                Session active: {testSession.sessionId}
              </Text>
              <TouchableOpacity style={[styles.sessionButton, styles.endButton]} onPress={endTestSession}>
                <Text style={styles.sessionButtonText}>🏁 End Test Session</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Partial Success Test Scenarios</Text>
          <Text style={styles.sectionDescription}>
            These test different partial import scenarios. Each has a target completion time for parent UX testing.
          </Text>

          {partialSuccessTestScenarios.map((scenario, index) => (
            <TouchableOpacity
              key={index}
              style={[styles.scenarioButton, isRunning && styles.disabledButton]}
              onPress={() => runTestScenario(scenario)}
              disabled={isRunning}
            >
              <View style={styles.scenarioHeader}>
                <Text style={styles.scenarioName}>{scenario.name}</Text>
                <Text style={styles.scenarioTarget}>⏱️ {scenario.timerTarget}s</Text>
              </View>
              <Text style={styles.scenarioDescription}>{scenario.description}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Real World Failure URLs</Text>
          <Text style={styles.sectionDescription}>
            Test with real URLs that commonly fail auto-import. These will test actual network requests.
          </Text>

          <TouchableOpacity
            style={[styles.scenarioButton, isRunning && styles.disabledButton]}
            onPress={() => runRealWorldTest('https://www.foodnetwork.com/recipes/alton-brown/chocolate-chip-cookies-recipe-1946256')}
            disabled={isRunning}
          >
            <Text style={styles.scenarioName}>Food Network (Complex DOM)</Text>
            <Text style={styles.scenarioDescription}>Often fails due to complex page structure</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scenarioButton, isRunning && styles.disabledButton]}
            onPress={() => runRealWorldTest('https://cooking.nytimes.com/recipes/1015819-chocolate-chip-cookies')}
            disabled={isRunning}
          >
            <Text style={styles.scenarioName}>NY Times (Paywall)</Text>
            <Text style={styles.scenarioDescription}>May be blocked by paywall</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.scenarioButton, isRunning && styles.disabledButton]}
            onPress={() => runRealWorldTest('https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/')}
            disabled={isRunning}
          >
            <Text style={styles.scenarioName}>AllRecipes (Ad-heavy)</Text>
            <Text style={styles.scenarioDescription}>Heavy with ads and dynamic content</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.instructions}>
          <Text style={styles.instructionsTitle}>📋 How to Use This Test Screen</Text>
          <Text style={styles.instructionsText}>
            1. Start a test session to enable mock mode{'\n'}
            2. Run partial success scenarios to test the review UX{'\n'}
            3. Time yourself manually to see if you can complete within target{'\n'}
            4. Test real world URLs to see current failure handling{'\n'}
            5. End test session to see results summary{'\n'}
            {'\n'}
            🎯 Goal: Any recipe → saved in KidChef within 2 minutes
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 50,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    lineHeight: 20,
  },
  sessionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginBottom: 10,
  },
  endButton: {
    backgroundColor: '#28a745',
  },
  sessionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sessionInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  scenarioButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  disabledButton: {
    opacity: 0.6,
  },
  scenarioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  scenarioName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  scenarioTarget: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '500',
  },
  scenarioDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  instructions: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    marginTop: 20,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#664d03',
    marginBottom: 10,
  },
  instructionsText: {
    fontSize: 14,
    color: '#664d03',
    lineHeight: 20,
  },
  notAvailable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notAvailableText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default TestImportScreen;
