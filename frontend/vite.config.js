import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// WebContainer must boot from a document with COOP/COEP. Keep the
// isolation scoped to the tiny runtime document so the normal DevDrop app
// (including OAuth popup flows) keeps its existing browser behavior.
const WEBCONTAINER_RUNTIME_PATH = '/webcontainer-runtime.html';

function webcontainerIsolationHeaders() {
  const applyIfMatch = (req, res, next) => {
    const url = req.url || '';
    if (url.split('?')[0] === WEBCONTAINER_RUNTIME_PATH) {
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
      input: {
        main: 'index.html',
        webcontainerRuntime: 'webcontainer-runtime.html',
      },
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
