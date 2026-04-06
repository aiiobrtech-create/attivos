import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

/** Base pública (ex.: app em https://dominio.com/attivos/ → VITE_BASE_PATH=/attivos/). */
function normalizeBase(p: string | undefined): string {
  if (!p || p === '/') return '/';
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE_PATH),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    port: 4000,
    host: '0.0.0.0',
    strictPort: true,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('jspdf')) return 'pdf';
            if (id.includes('motion') || id.includes('framer-motion')) return 'motion';
            if (id.includes('react-dom')) return 'react-dom';
            if (id.includes('react')) return 'react';
          }
        },
      },
    },
  },
});
