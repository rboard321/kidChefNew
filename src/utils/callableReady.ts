import { auth } from '../services/firebase';
import { getAppCheckToken } from '../services/appCheck';
import { getEnvironmentInfo } from './environment';

export async function waitForCallableReady(timeoutMs = 5000, intervalMs = 100): Promise<void> {
  const envInfo = getEnvironmentInfo();
  const requireAppCheck = envInfo.isProd || envInfo.isStaging;
  const start = Date.now();

  while (true) {
    const userReady = !!auth.currentUser;
    let appCheckReady = false;

    if (!requireAppCheck) {
      appCheckReady = true;
    } else {
      try {
        const token = await getAppCheckToken();
        appCheckReady = !!token;
      } catch {
        appCheckReady = false;
      }
    }

    if (userReady && appCheckReady) {
      return;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('Auth/App Check not ready for callable');
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
