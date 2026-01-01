import { useEffect, useRef, useCallback } from 'react';

interface UseSessionTimeoutOptions {
  timeoutDuration: number; // Duration in milliseconds
  onTimeout: () => void | Promise<void>;
  enabled?: boolean;
}

export const useSessionTimeout = ({
  timeoutDuration,
  onTimeout,
  enabled = true,
}: UseSessionTimeoutOptions) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const clearSession = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resetTimeout = useCallback(() => {
    clearSession();

    if (!enabled) return;

    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutDuration);
  }, [enabled, timeoutDuration, onTimeout, clearSession]);

  const trackActivity = useCallback(() => {
    if (!enabled) return;

    lastActivityRef.current = Date.now();
    resetTimeout();
  }, [enabled, resetTimeout]);

  useEffect(() => {
    if (enabled) {
      resetTimeout();
    } else {
      clearSession();
    }

    return () => {
      clearSession();
    };
  }, [enabled, resetTimeout, clearSession]);

  return {
    trackActivity,
    clearSession,
  };
};
