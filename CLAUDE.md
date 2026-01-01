# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### React Native App
```bash
# Start development server
npm start

# Run on specific platforms
npm run android
npm run ios
npm run web
```

### Firebase Cloud Functions
```bash
# Build functions
cd functions && npm run build

# Deploy functions
cd functions && npm run deploy

# Test functions locally
cd functions && npm run serve
```

### Firebase Management
```bash
# Check current project
firebase use

# Deploy all services
firebase deploy

# View function logs
firebase functions:log
```

## Architecture Overview

### Dual-User Experience Design
The app is architected around two distinct user modes:
- **Parent Mode**: Recipe management, URL import, settings configuration
- **Kid Mode**: Simplified recipe viewing with child-friendly UI and safety features

Navigation switches between `ParentTabNavigator` and `KidTabNavigator` based on user context, each with role-appropriate screens and functionality.

### Service Layer Architecture
The codebase follows a clean service-oriented pattern:

- **Authentication**: `src/contexts/AuthContext.tsx` manages global auth state via Firebase Auth
- **Recipe Management**: `src/services/recipeService.ts` handles Firestore CRUD operations
- **Recipe Import**: `src/services/recipeImportService.ts` integrates with Cloud Functions for web scraping
- **AI Processing**: `src/services/aiService.ts` converts recipes to kid-friendly versions (currently mock implementation)

### Firebase Integration Strategy
- **Authentication**: Email/password with AsyncStorage persistence for React Native
- **Database**: Firestore with user-scoped data isolation pattern
- **Cloud Functions**: Professional recipe scraper with multiple fallback strategies
- **Configuration**: `src/services/firebase.ts` centralizes all Firebase service initialization

### Recipe Data Flow
```
Web URL → Cloud Function (JSON-LD/Microdata/CSS scraping) → Firestore → AI Service → Kid-Friendly Recipe
```

## Key Technical Patterns

### Type Safety
Complete TypeScript coverage with strict mode enabled:
- `src/types/index.ts` contains all core interfaces (Recipe, KidRecipe, UserProfile)
- Navigation is fully type-safe via React Navigation v7 TypeScript integration
- Service interfaces ensure consistent API contracts

### Component Organization
```
src/screens/
├── onboarding/     # Welcome flow screens
├── parent/         # Adult user interface
├── kid/           # Child-friendly interface
└── shared/        # Common screens (RecipeDetail)
```

### Cloud Functions Architecture
`functions/src/index.ts` implements a robust 3-tier recipe extraction system:
1. **JSON-LD structured data** (highest reliability)
2. **Microdata parsing** (fallback for older sites)
3. **CSS selector extraction** (universal fallback)

## Development Workflow

### Firebase Setup Requirements
1. The app requires Firebase project configuration in `src/services/firebase.ts`
2. Cloud Functions must be deployed for recipe import functionality
3. Firestore security rules should follow user-scoped data patterns

### State Management
- Authentication state managed via React Context (`AuthContext`)
- User profiles stored in Firestore with UID-based document structure
- Recipe data follows user-scoped Firestore collections

### AI Service Integration
The `aiService` is designed with a clean interface for production AI integration:
- Currently uses rule-based mock implementation
- Ready for OpenAI/Claude API integration
- Handles kid-friendly language conversion and safety note generation

## Important Notes

### Current Implementation Status
- UI components are implemented but use mock data
- Firebase services are architecturally complete but require connection to UI
- Cloud Functions are production-ready and deployed
- AI service interface is ready for real implementation

### Navigation Flow
The app uses nested navigation: `RootStackNavigator` → `AppNavigator` → Mode-specific tab navigators. The `AuthContext` determines which navigator tree to render based on authentication and onboarding state.

### Expo Configuration
Built on Expo SDK 54 with React Native 0.81.5. The `app.json` contains standard Expo configuration for cross-platform deployment.