import * as Linking from 'expo-linking';
import { NavigationContainerRef } from '@react-navigation/native';
import { recipeImportService } from './recipeImport';

class DeepLinkService {
  private navigationRef: React.RefObject<NavigationContainerRef<any>> | null = null;

  setNavigationRef(ref: React.RefObject<NavigationContainerRef<any>>) {
    this.navigationRef = ref;
  }

  initialize() {
    // Handle app opened from deep link when app was closed
    Linking.getInitialURL().then((url) => {
      if (url) {
        this.handleDeepLink(url);
      }
    });

    // Handle deep links when app is already open
    Linking.addEventListener('url', ({ url }) => {
      this.handleDeepLink(url);
    });
  }

  private async handleDeepLink(url: string) {
    try {
      console.log('Handling deep link:', url);

      const parsed = Linking.parse(url);

      if (parsed.hostname === 'import' && parsed.queryParams?.url) {
        const recipeUrl = decodeURIComponent(parsed.queryParams.url as string);
        await this.handleRecipeImport(recipeUrl);
      }
    } catch (error) {
      console.error('Error handling deep link:', error);
    }
  }

  private async handleRecipeImport(url: string) {
    try {
      // Navigate to the import screen with the URL
      if (this.navigationRef?.current) {
        this.navigationRef.current.navigate('Import' as never, {
          importUrl: url
        } as never);
      }
    } catch (error) {
      console.error('Error importing recipe from deep link:', error);
    }
  }

  // Method to manually trigger recipe import (for testing)
  async importRecipeFromUrl(url: string) {
    await this.handleRecipeImport(url);
  }
}

export const deepLinkService = new DeepLinkService();