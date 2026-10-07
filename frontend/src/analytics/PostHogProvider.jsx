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
    let timeoutId;
    let loaded = false;

    const loadPostHog = async () => {
      if (loaded) return;
      loaded = true;
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

    const handleFirstInteraction = () => loadPostHog();
    const scheduleLoad = () => {
      // Keep analytics out of the first several seconds of the page lifecycle.
      // Interaction still initializes PostHog immediately for engaged users.
      timeoutId = window.setTimeout(loadPostHog, 15000);
    };

    if (document.readyState === 'complete') {
      scheduleLoad();
    } else {
      window.addEventListener('load', scheduleLoad, { once: true });
    }

    window.addEventListener('pointerdown', handleFirstInteraction, { once: true, passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { once: true });
    window.addEventListener('touchstart', handleFirstInteraction, { once: true, passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', scheduleLoad);
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
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
