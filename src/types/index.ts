import type { Timestamp } from 'firebase/firestore';

// Common Types
export type ReadingLevel = 'beginner' | 'intermediate' | 'advanced';

// Date types that handle both Date objects and Firestore Timestamps
type FirestoreDate = Date | Timestamp;

// Enhanced Multi-Kid Profile Types
export interface ParentProfile {
  id: string;
  userId: string; // Firebase Auth UID
  familyName: string;
  parentName: string;
  email: string;
  settings: UserSettings;
  kidModePin?: string; // 4-digit PIN to exit kid mode
  kidIds: string[]; // References to KidProfile documents (legacy)
  termsAcceptedAt?: FirestoreDate;
  privacyPolicyAcceptedAt?: FirestoreDate;
  coppaDisclosureAccepted?: boolean;
  coppaConsentDate?: FirestoreDate;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export interface KidProfile {
  id: string;
  parentId: string; // Reference to ParentProfile
  name: string;
  age: number;
  readingLevel: ReadingLevel;
  allergyFlags: string[]; // e.g., ['nuts', 'dairy', 'eggs']
  permissions: KidPermissions;
  avatarEmoji?: string;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export interface KidPermissions {
  canViewIngredients: boolean;
  canUseKnives: boolean;
  canUseStove: boolean;
  canUseOven: boolean;
  requiresAdultHelp: boolean;
  maxCookingTimeMinutes: number;
}

export interface UserSettings {
  safetyNotes: boolean;
  readAloud: boolean;
  autoSimplify: boolean;
  fontSize: 'small' | 'medium' | 'large';
  temperatureUnit: 'fahrenheit' | 'celsius';
  language: string; // ISO language code
  showDifficulty: boolean;
  enableVoiceInstructions: boolean;
  theme: 'light' | 'dark' | 'auto';
}

// Recipe Category and Rating Types
export type RecipeCategory =
  | 'quick-meals'      // 30 minutes or less
  | 'no-cook'          // No cooking required
  | 'baking'           // Baking and desserts
  | 'healthy'          // Nutritious options
  | 'kid-favorites'    // Popular with kids
  | 'cultural'         // International cuisine
  | 'holiday'          // Special occasions
  | 'beginner-friendly' // Great for new cooks
  | 'advanced'         // For experienced kid chefs
  | 'one-pot';         // Minimal cleanup

export interface RecipeRating {
  id: string;
  recipeId: string;
  kidId: string;
  parentId: string;
  rating: 1 | 2 | 3 | 4 | 5; // 1 = 😕, 2 = 😐, 3 = 🙂, 4 = 😋, 5 = 🤤
  emoji: '😕' | '😐' | '🙂' | '😋' | '🤤';
  comment?: string;
  createdAt: FirestoreDate;
}

export interface RecipeFavorite {
  id: string;
  recipeId: string;
  kidId?: string;
  parentId: string;
  parentUserId: string;
  isFavorited: boolean;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export interface RecipeRecommendation {
  id: string;
  kidId: string;
  recipeId: string;
  reason: 'skill_level' | 'age_appropriate' | 'dietary_match' | 'progression' | 'popular';
  confidence: number; // 0-1 confidence score
  createdAt: FirestoreDate;
}

// Enhanced Recipe Types
export interface Recipe {
  id: string;
  userId?: string; // Legacy field - deprecated, will be removed
  parentId: string; // Required - links to ParentProfile
  title: string;
  description?: string;
  url?: string;
  image?: string;
  servings: number;
  prepTime?: number | string;
  cookTime?: number | string;
  totalTime?: number | string;
  difficulty?: 'easy' | 'medium' | 'hard';
  cuisine?: string;
  mealType?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'dessert';
  ingredients: Array<Ingredient | string>;
  steps?: RecipeStep[];
  instructions?: string[]; // Legacy field for backward compatibility
  allergens?: string[]; // Common allergens in this recipe
  equipment?: string[]; // Required cooking equipment
  tags?: string[]; // Custom tags for organization
  categories?: RecipeCategory[]; // Recipe categories for better organization
  averageRating?: number; // Average rating from 1-5
  ratingCount?: number; // Number of ratings received
  isRecommended?: boolean; // Marked as recommended by system
  importStatus?: 'complete' | 'needs_review';
  importIssues?: string[];
  importConfidence?: number;
  skillsRequired?: string[]; // Skills this recipe teaches/requires
  nutritionInfo?: NutritionInfo;
  kidVersionId?: string; // Reference to simplified version
  isFavorite?: boolean;
  lastCooked?: FirestoreDate;
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export interface Ingredient {
  id: string;
  name: string;
  amount?: number;
  unit?: string;
  notes?: string;
  order: number;
  allergens?: string[]; // Allergens in this specific ingredient
  isOptional?: boolean;
  substitutions?: string[]; // Alternative ingredients
}

export interface RecipeStep {
  id: string;
  step: string;
  order: number;
  temperature?: string;
  time?: string;
  equipment?: string[]; // Equipment needed for this step
  safetyWarning?: string; // Safety notes for this step
  difficulty?: 'easy' | 'medium' | 'hard';
  requiresAdultSupervision?: boolean;
}

// Nutrition Information
export interface NutritionInfo {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  servingSize?: string;
}

// Enhanced Kid-Friendly Recipe Types
export interface KidRecipe {
  id: string;
  originalRecipeId: string;
  userId: string; // Legacy field for backward compatibility
  parentId: string; // Required field linking to ParentProfile
  kidId: string; // Required field for the specific kid this version was created for
  kidAge: number;
  targetReadingLevel: 'beginner' | 'intermediate' | 'advanced';
  simplifiedIngredients: KidIngredient[];
  simplifiedSteps: KidStep[];
  safetyNotes: string[];
  estimatedDuration?: number; // Total time including prep for kids
  skillsRequired?: string[]; // Skills this recipe helps develop
  conversionCount?: number; // Track how many times converted
  lastConvertedAt?: FirestoreDate; // When last converted
  isActive?: boolean; // If false, kid can reconvert
  approvalStatus: 'pending' | 'approved' | 'rejected'; // Parent approval status
  approvalRequestedAt?: FirestoreDate; // When conversion completed and requested approval
  approvalReviewedAt?: FirestoreDate; // When parent approved/rejected
  approvalNotes?: string; // Optional notes from parent
  createdAt: FirestoreDate;
}

export interface KidRecipeCacheEntry {
  sourceUrl: string;
  readingLevel: ReadingLevel;
  ageRange: string;
  kidAge: number;
  simplifiedIngredients: KidIngredient[];
  simplifiedSteps: KidStep[];
  safetyNotes: string[];
  estimatedDuration?: number;
  skillsRequired?: string[];
  createdAt: FirestoreDate;
  updatedAt: FirestoreDate;
}

export interface KidIngredient {
  id: string;
  name: string;
  amount?: number;
  unit?: string;
  kidFriendlyName: string;
  description?: string;
  order: number;
}

export interface KidStep {
  id: string;
  step: string;
  kidFriendlyText: string;
  icon?: string;
  safetyNote?: string;
  time?: string;
  order: number;
  completed: boolean;
  difficulty?: 'easy' | 'medium' | 'hard';
  encouragement?: string; // Motivational message for kids
  helpText?: string; // Additional guidance for this step
  visualAid?: string; // URL or description of visual help
}

// Multi-Kid Feature Types
export interface RecipeRecommendation {
  recipeId: string;
  score: number; // 0-100 compatibility score
  reasons: string[]; // Why this recipe is recommended
  adaptations?: string[]; // Suggested modifications
}

export interface CookingSession {
  id: string;
  kidId: string;
  recipeId: string;
  kidRecipeId?: string;
  startedAt: FirestoreDate;
  completedAt?: FirestoreDate;
  currentStep: number;
  totalSteps: number;
  notes?: string;
  rating?: number; // 1-5 stars
  photos?: string[]; // URLs to photos taken during cooking
}

export interface FamilyMeal {
  id: string;
  parentId: string;
  name: string;
  description?: string;
  scheduledFor: FirestoreDate;
  recipeIds: string[];
  assignedKids: string[]; // Which kids are helping
  status: 'planned' | 'in_progress' | 'completed';
  notes?: string;
}

export interface KidBadge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  earnedAt: FirestoreDate;
  category: 'cooking' | 'safety' | 'creativity' | 'healthy' | 'special';
}

export interface KidAchievement {
  id: string;
  title: string;
  description: string;
  type: 'first_recipe' | 'week_streak' | 'healthy_choice' | 'safety_star' | 'creative_chef';
  unlockedAt: FirestoreDate;
  celebrationShown: boolean;
}

// Enhanced Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Welcome: undefined;
  KidLevel: undefined;
  ParentalConsent: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  ParentSettings: { kidData?: { name: string; age: number; readingLevel: 'beginner' | 'intermediate' | 'advanced' } };
  Main: undefined;
  RecipeDetail: { recipeId: string };
  RecipeEdit: { recipeId: string };
  RecipeView: { recipeId?: string; kidRecipeId?: string; kidId?: string };
  KidRecipeDetail: { kidRecipeId: string };
  KidRecipeView: { recipeId: string; kidId: string };
  CookingMode: { kidRecipeId: string; kidId?: string };
  KidSelector: undefined;
  KidManagement: undefined;
  KidProfileDetail: { kid: KidProfile };
  RecipeManagement: undefined;
  Favorites: undefined;
  BadgeCollection: undefined;
  FamilyMeals: undefined;
  CookingHistory: { kidId?: string };
  KidRecipePreview: { kidRecipeId: string };
};

export type AppMode = 'parent' | 'kid';

export type ParentTabParamList = {
  Home: undefined;
  Import: undefined;
  Kids: undefined;
  Settings: undefined;
};

export type KidTabParamList = {
  Recipes: undefined;
  Parent: undefined;
};

// App State Types
export interface AppState {
  isFirstLaunch: boolean;
  currentMode: 'parent' | 'kid';
  parentProfile: ParentProfile | null;
  settings: UserSettings;
}

// API Types
export interface ScrapedRecipe {
  title: string;
  image?: string;
  ingredients: string[];
  steps: string[];
  servings?: number;
  prepTime?: number;
  cookTime?: number;
}

export interface KidConversionRequest {
  recipe: Recipe;
  kidAge: number;
  readingLevel: string;
  includeSafetyNotes: boolean;
}

export interface KidConversionResponse {
  simplifiedIngredients: KidIngredient[];
  simplifiedSteps: KidStep[];
  safetyNotes: string[];
}
