import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import PostHogProvider from './analytics/PostHogProvider'
const root = createRoot(document.getElementById('root'));

root.render(
  <StrictMode>
    <PostHogProvider>
      <App />
    </PostHogProvider>
  </StrictMode>,
);

// Sentry is intentionally loaded after the initial React render. Its replay
// and tracing integrations are non-critical for first paint and can otherwise
// add synchronous startup work to the main thread.
if (import.meta.env.VITE_SENTRY_DSN) {
  const loadSentry = async () => {
    try {
      const Sentry = await import('@sentry/react');
      Sentry.init({
        dsn: import.meta.env.VITE_SENTRY_DSN,
        integrations: [
          Sentry.browserTracingIntegration(),
          Sentry.replayIntegration(),
        ],
        tracesSampleRate: 1.0,
        replaysSessionSampleRate: 0.1,
        replaysOnErrorSampleRate: 1.0,
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Sentry failed to load:', error);
      }
    }
  };

  let loaded = false;

  const startSentry = () => {
    if (loaded) return;
    loaded = true;
    loadSentry();
  };

  // Don't load Sentry merely because the browser becomes idle during the
  // initial page audit. Wait for meaningful interaction, or use a long
  // fallback so real users still get monitoring without extending the LCP
  // critical request chain.
  window.addEventListener('pointerdown', startSentry, { once: true, passive: true });
  window.addEventListener('keydown', startSentry, { once: true });
  window.addEventListener('touchstart', startSentry, { once: true, passive: true });

  const sentryFallback = window.setTimeout(startSentry, 15000);

  window.addEventListener('pagehide', () => {
    window.clearTimeout(sentryFallback);
  }, { once: true });
}
