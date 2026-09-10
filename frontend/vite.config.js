import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// WebContainer (Section 3 of the AI Studio preview spec) requires the
// page that boots it to be cross-origin isolated, which means both:
//   Cross-Origin-Opener-Policy: same-origin
//   Cross-Origin-Embedder-Policy: require-corp
// on the document response. Setting these globally would break the
// existing OAuth popup flow (Vercel connect, etc.), which relies on
// `window.opener` under the current looser
// `same-origin-allow-popups` / no-COEP setup. So instead of changing the
// global `server.headers`, this plugin applies the strict pair ONLY to
// requests for the AI Studio preview workspace route — every other route
// (including the OAuth callback) keeps the existing headers untouched.
const WEBCONTAINER_ROUTE_PREFIX = '/ai-studio/preview';

function webcontainerIsolationHeaders() {
  const applyIfMatch = (req, res, next) => {
    const url = req.url || '';
    if (
      url === WEBCONTAINER_ROUTE_PREFIX ||
      url.startsWith(`${WEBCONTAINER_ROUTE_PREFIX}/`) ||
      url.startsWith(`${WEBCONTAINER_ROUTE_PREFIX}?`)
    ) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    next();
  };

  return {
    name: 'devdrop-webcontainer-isolation-headers',
    configureServer(server) {
      server.middlewares.use(applyIfMatch);
    },
    configurePreviewServer(server) {
      server.middlewares.use(applyIfMatch);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), webcontainerIsolationHeaders()],
  build: {
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (['react', 'react-dom', 'react-router-dom'].some(pkg => id.includes(`/node_modules/${pkg}/`))) return 'vendor';
            if (id.includes('/node_modules/framer-motion/')) return 'motion';
            if (id.includes('/node_modules/lucide-react/') || id.includes('/node_modules/sonner/')) return 'ui';
            if (id.includes('/node_modules/gsap/')) return 'gsap';
            if (id.includes('/node_modules/@monaco-editor/') || id.includes('/node_modules/monaco-editor/')) return 'monaco';
            if (id.includes('/node_modules/@webcontainer/')) return 'webcontainer';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    port: 5173,
    strictPort: false,
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
});
