import React, { createContext, useContext, useState, useRef } from 'react';
import { recipeImportService, ImportStatus, ImportError, ImportResult } from '../services/recipeImport';
import { recipeService } from '../services/recipes';
import { cacheService } from '../services/cacheService';
import { useAuth } from './AuthContext';
import { importProgressService } from '../services/importProgressService';
import { testScenarioRunner, partialSuccessTestScenarios } from '../utils/testScenarios';
import type { Recipe } from '../types';

interface ImportJob {
  id: string;
  url: string;
  status: ImportStatus;
  progress?: string;
  error?: ImportError;
  result?: Recipe;
  partialData?: any;  // For partial recipe data that needs review
  startedAt: Date;
}

interface ImportContextType {
  activeImports: ImportJob[];
  importRecipe: (url: string) => Promise<string>; // Returns job ID
  getImportStatus: (jobId: string) => ImportJob | null;
  completeReview: (jobId: string, finalRecipe: any) => Promise<void>; // Complete partial recipe review
  clearCompletedImports: () => void;
  onImportComplete?: (recipe: Recipe) => void;
  onImportError?: (error: ImportError, url: string) => void;
}

const ImportContext = createContext<ImportContextType | undefined>(undefined);

export const useImport = () => {
  const context = useContext(ImportContext);
  if (context === undefined) {
    throw new Error('useImport must be used within an ImportProvider');
  }
  return context;
};

export const ImportProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, parentProfile } = useAuth();
  const [activeImports, setActiveImports] = useState<ImportJob[]>([]);
  const jobIdCounter = useRef(0);

  const generateJobId = () => {
    jobIdCounter.current += 1;
    return `import_${Date.now()}_${jobIdCounter.current}`;
  };

  const updateImportJob = (jobId: string, updates: Partial<ImportJob>) => {
    setActiveImports(prev =>
      prev.map(job =>
        job.id === jobId
          ? { ...job, ...updates }
          : job
      )
    );
  };

  const getImportStatus = (jobId: string): ImportJob | null => {
    return activeImports.find(job => job.id === jobId) || null;
  };

  const completeReview = async (jobId: string, finalRecipe: any): Promise<void> => {
    if (!user?.uid || !parentProfile?.id) {
      throw new Error('User not authenticated or parent profile missing');
    }

    try {
      // Save the completed recipe
      const recipeWithIds = {
        ...finalRecipe,
        parentId: parentProfile.id
      };

      const recipeId = await recipeService.addRecipe(recipeWithIds, parentProfile.id);
      const savedRecipe = { ...recipeWithIds, id: recipeId, createdAt: new Date(), updatedAt: new Date() };

      updateImportJob(jobId, {
        status: ImportStatus.COMPLETE,
        progress: 'Recipe completed and saved!',
        result: savedRecipe
      });

      // Clear cache for UI refresh
      cacheService.invalidateRecipes(parentProfile.id);

      // Emit completion event
      const job = activeImports.find(j => j.id === jobId);
      if (job) {
        importProgressService.emitComplete(jobId, job.url, savedRecipe);
      }
    } catch (error) {
      console.error('Error completing recipe review:', error);
      updateImportJob(jobId, {
        status: ImportStatus.ERROR,
        progress: 'Failed to save completed recipe',
        error: {
          code: 'SAVE_FAILED',
          message: 'Failed to save completed recipe',
          canRetry: true,
          severity: 'high' as const
        }
      });
      throw error;
    }
  };

  const clearCompletedImports = () => {
    setActiveImports(prev =>
      prev.filter(job =>
        job.status !== ImportStatus.COMPLETE &&
        job.status !== ImportStatus.ERROR
        // Keep NEEDS_REVIEW jobs so parent can see them
      )
    );
  };

  const importRecipe = async (url: string): Promise<string> => {
    if (!user?.uid) {
      throw new Error('User not authenticated');
    }

    if (!parentProfile?.id) {
      throw new Error('Parent profile required for recipe import');
    }

    const jobId = generateJobId();

    // Create initial import job
    const newJob: ImportJob = {
      id: jobId,
      url,
      status: ImportStatus.VALIDATING,
      progress: 'Starting import...',
      startedAt: new Date(),
    };

    setActiveImports(prev => [...prev, newJob]);

    // Start the import process
    try {
      // Simple progress tracking
      updateImportJob(jobId, {
        status: ImportStatus.FETCHING,
        progress: 'Importing recipe...'
      });
      importProgressService.emitProgress(jobId, url, ImportStatus.FETCHING, 'Importing recipe...');

      try {
        // Check if this is a test scenario URL
        const testScenario = partialSuccessTestScenarios.find(scenario => scenario.testUrl === url);
        let result: ImportResult;

        if (testScenario && __DEV__) {
          // Use test scenario runner for development testing
          result = await testScenarioRunner.runScenario(testScenario);
        } else {
          // Use normal import service
          result = await recipeImportService.importFromUrl(url, {
            maxRetries: 3,
            onRetry: (attempt, error) => {
              updateImportJob(jobId, {
                progress: `Retrying... (attempt ${attempt})`,
                error: {
                  code: 'RETRY',
                  message: error.message,
                  canRetry: true
                }
              });
            }
          });
        }

        if (result.success && result.recipe) {
          // Save the recipe to the user's collection
          try {
            const recipeWithIds = {
              ...result.recipe,
              parentId: parentProfile.id // REQUIRED
            };
            const recipeId = await recipeService.addRecipe(recipeWithIds, parentProfile.id);
            const savedRecipe = { ...recipeWithIds, id: recipeId, createdAt: new Date(), updatedAt: new Date() };

            updateImportJob(jobId, {
              status: ImportStatus.COMPLETE,
              progress: 'Recipe saved successfully!',
              result: savedRecipe
            });

            // Clear cache to ensure UI refreshes after import
            cacheService.invalidateRecipes(parentProfile.id);

            // Emit completion event
            importProgressService.emitComplete(jobId, url, savedRecipe);

            return jobId;
          } catch (saveError) {
            console.error('Error saving recipe:', saveError);
            const error: ImportError = {
              code: 'SAVE_FAILED',
              message: 'Recipe imported but failed to save',
              suggestion: 'Please try importing again',
              canRetry: true
            };

            updateImportJob(jobId, {
              status: ImportStatus.ERROR,
              progress: 'Failed to save recipe',
              error
            });

            // Emit error event
            importProgressService.emitError(jobId, url, error);

            return jobId;
          }
        } else if (result.needsReview && result.partialSuccess) {
          // Handle partial success - needs parent review
          updateImportJob(jobId, {
            status: ImportStatus.NEEDS_REVIEW,
            progress: 'Recipe partially extracted - review required',
            partialData: result.partialSuccess,
            error: result.error
          });

          // Emit partial success event
          importProgressService.emitProgress(jobId, url, ImportStatus.NEEDS_REVIEW, 'Partial import - review required');

          return jobId;
        } else {
          // Import failed
          const error = result.error || {
            code: 'UNKNOWN_ERROR',
            message: 'Import failed for unknown reason',
            canRetry: true
          };

          updateImportJob(jobId, {
            status: ImportStatus.ERROR,
            progress: 'Import failed',
            error
          });

          // Emit error event
          importProgressService.emitError(jobId, url, error);

          return jobId;
        }
      } catch (error: any) {
        console.error('Import error:', error);

        const importError: ImportError = {
          code: 'IMPORT_FAILED',
          message: error?.message || 'Import failed',
          canRetry: true
        };

        updateImportJob(jobId, {
          status: ImportStatus.ERROR,
          progress: 'Import failed',
          error: importError
        });

        // Emit error event
        importProgressService.emitError(jobId, url, importError);

        return jobId;
      }
    } catch (error: any) {
      console.error('Import setup error:', error);

      const importError: ImportError = {
        code: 'IMPORT_FAILED',
        message: error?.message || 'Failed to start import',
        canRetry: true
      };

      updateImportJob(jobId, {
        status: ImportStatus.ERROR,
        progress: 'Import failed',
        error: importError
      });

      // Emit error event
      importProgressService.emitError(jobId, url, importError);

      return jobId;
    }
  };

  const value: ImportContextType = {
    activeImports,
    importRecipe,
    getImportStatus,
    completeReview,
    clearCompletedImports,
    onImportComplete: undefined, // Will be set by components that need it
    onImportError: undefined,    // Will be set by components that need it
  };

  return (
    <ImportContext.Provider value={value}>
      {children}
    </ImportContext.Provider>
  );
};

export { ImportContext };