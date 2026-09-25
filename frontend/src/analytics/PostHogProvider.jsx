import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PostHogContext = createContext({
  capture: () => {},
});

export function usePostHog() {
  return useContext(PostHogContext);
}

export default function PostHogProvider({ children }) {
  const [client, setClient] = useState(null);

  useEffect(() => {
    const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
    if (!token) return;

    let cancelled = false;
    let idleId;
    let timeoutId;

    const loadPostHog = async () => {
      try {
        const { default: posthog } = await import('posthog-js');
        if (cancelled) return;

        posthog.init(token, {
          api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
          person_profiles: 'identified_only',
        });

        if (!cancelled) setClient(posthog);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('PostHog failed to load:', error);
        }
      }
    };

    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(loadPostHog, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(loadPostHog, 1200);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const value = useMemo(
    () => ({
      capture: (...args) => client?.capture?.(...args),
    }),
    [client]
  );

  return (
    <PostHogContext.Provider value={value}>
      {children}
    </PostHogContext.Provider>
  );
}
