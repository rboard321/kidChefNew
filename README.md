# KidChef 👨‍🍳👩‍🍳

A React Native mobile app that transforms regular recipes into kid-friendly cooking adventures. Parents can import recipes from any website, and kids can follow simplified, age-appropriate instructions.

## 🌟 Features

### Parent Mode
- **Recipe Import**: Import recipes from any website URL
- **Recipe Management**: View, edit, and organize family recipes
- **Recipe Scaling**: Adjust serving sizes automatically
- **Kid-Friendly Conversion**: Transform recipes into age-appropriate versions using AI

### Kid Mode
- **Simplified Instructions**: Age-appropriate language and step-by-step guidance
- **Safety Alerts**: Clear warnings when adult help is needed
- **Visual Progress**: Track cooking progress with colorful step indicators
- **Encouragement System**: Positive reinforcement throughout cooking

### Smart Features
- **Reading Levels**: Beginner (6-8), Intermediate (9-12), Advanced (12+)
- **Safety First**: Automatic detection of potentially dangerous steps
- **Text-to-Speech Ready**: Designed for future read-aloud functionality
- **Offline Support**: Recipes saved locally for offline cooking

## 🏗️ Technical Architecture

### Frontend (React Native + Expo)
- **Navigation**: React Navigation 6 with bottom tabs
- **State Management**: React Context + hooks
- **UI Components**: Custom components with consistent design system
- **TypeScript**: Full type safety throughout the app

### Backend Services
- **Authentication**: Firebase Auth with custom user profiles
- **Database**: Firestore for real-time recipe storage
- **File Storage**: Firebase Storage for recipe images
- **AI Integration**: Service layer ready for OpenAI/Claude integration

### Key Services
- `authService`: User authentication and profile management
- `recipeService`: Recipe CRUD operations with Firestore
- `recipeImportService`: URL-based recipe scraping (mock implementation)
- `aiService`: AI-powered kid-friendly recipe conversion

## 📱 App Structure

```
src/
├── components/           # Reusable UI components
├── contexts/            # React contexts (AuthContext)
├── navigation/          # Navigation configuration
├── screens/             # Screen components
│   ├── onboarding/     # Welcome, kid level selection, settings
│   ├── parent/         # Parent mode screens
│   ├── kid/            # Kid mode screens
│   └── shared/         # Shared screens (settings)
├── services/           # API and business logic
├── types/              # TypeScript type definitions
└── utils/              # Helper functions
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI
- iOS Simulator or Android Emulator

### Installation
1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd KidChef
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Firebase**
   - Create a Firebase project
   - Enable Authentication, Firestore, and Storage
   - Replace the config in `src/services/firebase.ts`

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Run on device/simulator**
   ```bash
   npm run ios     # iOS
   npm run android # Android
   ```

## 🔧 Configuration

### Firebase Setup
1. Create a new Firebase project
2. Enable the following services:
   - Authentication (Email/Password)
   - Firestore Database
   - Cloud Storage
   - Cloud Functions (for future recipe scraping)

3. Update `src/services/firebase.ts` with your config:
```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### AI Service Integration
The app includes a mock AI service. To integrate with real AI:

1. **OpenAI Integration**: Replace `mockKidFriendlyConversion` in `aiService.ts`
2. **Custom Backend**: Implement recipe scraping with Cloud Functions
3. **Recipe Parsing**: Use services like recipe-scraper or custom parsers

## 📋 User Flow

### Onboarding
1. **Welcome Screen**: Introduction to KidChef
2. **Kid Level Selection**: Choose reading level (Beginner/Intermediate/Advanced)
3. **Parent Settings**: Configure safety features and preferences

### Parent Flow
1. **Home Screen**: View saved recipes
2. **Import Recipe**: Paste URL to import new recipes
3. **Recipe Detail**: View/edit recipe, convert to kid-friendly
4. **Settings**: Manage family profiles and app preferences

### Kid Flow
1. **Recipe Selection**: Browse kid-friendly recipes
2. **Cooking Mode**: Step-by-step cooking instructions
3. **Safety Guidance**: Clear alerts for adult supervision needed

## 🎯 Future Enhancements

### Phase 2 Features
- [ ] Real recipe scraping integration
- [ ] Text-to-speech for instructions
- [ ] Photo capture for cooking progress
- [ ] Recipe sharing between families
- [ ] Cooking achievements and badges

### Technical Improvements
- [ ] Offline-first architecture
- [ ] Push notifications for meal planning
- [ ] Voice commands integration
- [ ] Accessibility improvements
- [ ] Performance optimizations

### AI Enhancements
- [ ] Real-time AI assistance during cooking
- [ ] Ingredient substitution suggestions
- [ ] Nutritional information for kids
- [ ] Allergy-aware recipe modifications

## 🧪 Testing

### Current Status
- Basic navigation flow implemented
- Mock data for development
- TypeScript type safety enforced

### Testing Strategy
```bash
# Run type checking
npm run type-check

# Run linting
npm run lint

# Future: Add Jest tests
npm test
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by the need for safe, educational cooking experiences for children
- Built with React Native and Expo for cross-platform compatibility
- Powered by Firebase for reliable backend services
- Designed with accessibility and safety as top priorities

---

**Built with ❤️ for families who love to cook together**