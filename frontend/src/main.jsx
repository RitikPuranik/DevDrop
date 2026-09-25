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

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadSentry, { timeout: 3000 });
  } else {
    window.setTimeout(loadSentry, 3000);
  }
}
