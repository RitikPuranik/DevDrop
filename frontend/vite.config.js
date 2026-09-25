import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// WebContainer must boot from a document with COOP/COEP. Keep the
// Keep WebContainer isolation scoped to the top-level AI Studio preview route
// so normal DevDrop/OAuth pages keep their existing browser behavior.
const PREVIEW_PATH_PREFIX = '/ai-studio/preview/';

function deferGeneratedCss() {
  return {
    name: 'devdrop-defer-generated-css',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<link\b([^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+\.css)["'][^>]*)>/gi,
          (_match, attrs, href) => [
            `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'">`,
            `<noscript><link rel="stylesheet" href="${href}"></noscript>`,
          ].join('')
        );
      },
    },
  };
}

function webcontainerIsolationHeaders() {
  const applyIfMatch = (req, res, next) => {
    const url = req.url || '';
    const pathname = url.split('?')[0];
    if (pathname.startsWith(PREVIEW_PATH_PREFIX)) {
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
  plugins: [react(), tailwindcss(), webcontainerIsolationHeaders(), deferGeneratedCss()],
  build: {
    target: 'esnext',
    minify: 'oxc',
    rollupOptions: {
      input: {
        main: 'index.html',
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
      // Only the AI Studio preview document needs cross-origin isolation for WebContainer.
      // The middleware above applies these headers to /ai-studio/preview/* requests.
    },
    port: 5173,
    strictPort: false,
  },
  preview: {
    headers: {},
  },
});
