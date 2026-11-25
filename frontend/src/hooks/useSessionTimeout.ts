/**
 * Session timeout hook — automatically signs out after idle period.
 *
 * Tracks user activity (mouse, keyboard, touch, scroll) and signs out
 * after the configured idle duration. Defaults to 4 hours (14,400,000 ms).
 *
 * Usage:
 *   useSessionTimeout({ idleTimeoutMs: 4 * 60 * 60 * 1000 });
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'aws-amplify/auth';

interface SessionTimeoutOptions {
  /** Idle duration before sign-out in milliseconds. Default: 4 hours. */
  idleTimeoutMs?: number;
  /** Countdown warning duration before sign-out (in ms). Shows warning when remaining time <= this value. */
  warningThresholdMs?: number;
  /** Whether the timeout is enabled. Default: true. */
  enabled?: boolean;
}

const DEFAULT_IDLE_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const DEFAULT_WARNING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before sign-out

export function useSessionTimeout({
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  warningThresholdMs = DEFAULT_WARNING_THRESHOLD_MS,
  enabled = true,
}: SessionTimeoutOptions = {}) {
  const router = useRouter();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(0);

  // Initialize lastActivity on mount, not during render
  useEffect(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Sign out and redirect to login
  const handleTimeout = async () => {
    try {
      await signOut();
    } catch {
      // SignOut may fail if session already expired; ignore
    }
    router.push('/login?reason=session_timeout');
  };

  // Reset the idle timer on user activity
  const resetTimer = () => {
    lastActivityRef.current = Date.now();

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }

    // Set new timers
    const warningDelay = idleTimeoutMs - warningThresholdMs;

    if (warningDelay > 0) {
      warningTimeoutRef.current = setTimeout(() => {
        console.warn(
          `[SessionTimeout] Session will expire in ${Math.round(warningThresholdMs / 60000)} minutes due to inactivity.`
        );
        // Could dispatch event or show modal here if UI needs it
      }, warningDelay);
    }

    timeoutRef.current = setTimeout(() => {
      console.log('[SessionTimeout] Session expired due to inactivity.');
      handleTimeout();
    }, idleTimeoutMs);
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Activity events to track
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];

    // Debounced activity handler (throttle to max once per 30 seconds)
    let lastReset = 0;
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastReset > 30_000) {
        lastReset = now;
        resetTimer();
      }
    };

    // Start timer initially
    resetTimer();

    // Add event listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      activityEvents.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idleTimeoutMs, warningThresholdMs, router]);

  // Return control functions only (not ref values during render)
  return {
    resetTimer,
  };
}
