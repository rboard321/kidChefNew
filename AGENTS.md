# Repository Guidelines

## Project Structure & Module Organization
- `App.tsx` and `index.ts` are the app entry points for the Expo React Native client.
- `src/` holds product code: `components/`, `contexts/`, `hooks/`, `navigation/`, `screens/`, `services/`, `types/`, and `utils/`.
- `functions/` contains Firebase Cloud Functions (TypeScript) and their build/deploy scripts.
- `assets/` stores static images and media; `plugins/` contains Expo config plugins.
- Configuration lives in `app.json`, `app.config.js`, `eas.json`, and `firebase.json`.

## Build, Test, and Development Commands
- `npm start` runs the Expo dev server.
- `npm run ios` / `npm run android` / `npm run web` runs the app on a target platform.
- `npm run start:dev` / `npm run start:staging` / `npm run start:prod` boots with explicit environment flags.
- `npm run build:dev` / `npm run build:staging` / `npm run build:prod` triggers EAS builds per environment.
- `cd functions && npm run build` compiles Cloud Functions; `npm run serve` starts the emulator; `npm run deploy` ships functions.

## Coding Style & Naming Conventions
- TypeScript strict mode is enabled (`tsconfig.json`); keep types explicit at API boundaries.
- Use 2-space indentation and single quotes in TS/TSX files (match existing code style).
- Components/screens use PascalCase filenames (e.g., `KidHomeScreen.tsx`), hooks use `useX` (e.g., `useKidRecipes.ts`).
- Services and utilities use camelCase filenames (e.g., `recipeImport.ts`, `apiKeyManager.ts`).

## Testing Guidelines
- The root app currently has no automated test runner configured; rely on manual QA via Expo targets.
- Validate functions with `cd functions && npm run build` and, when needed, the emulator with `npm run serve`.

## Commit & Pull Request Guidelines
- Git history uses short, plain-English subject lines (e.g., “Initial commit”); follow a concise, present-tense summary.
- PRs should include a clear description, testing notes (commands + platforms), and screenshots for UI changes.
- Link related issues and note any required Firebase or environment changes.

## Security & Configuration Tips
- Environment-specific values live in `.env*` files and are not committed; see `ENVIRONMENT_SETUP.md`.
- Firebase app initialization is centralized in `src/services/firebase.ts`; keep secrets out of source.
- Review `SECURITY_SETUP.md` before changing auth, Firestore rules, or App Check settings.

## Additional References
- `CLAUDE.md` documents architecture, services, and extended workflows for contributors and agents.
