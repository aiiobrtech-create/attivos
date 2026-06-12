import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

/** Base pública (ex.: app em https://dominio.com/attivos/ → VITE_BASE_PATH=/attivos/). */
function normalizeBase(p: string | undefined): string {
  if (!p || p === '/') return '/';
  const withSlash = p.startsWith('/') ? p : `/${p}`;
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
}

/** Prefixo HTTP local para proxy do Supabase (deve coincidir com `getSupabaseHttpBase` em supabaseClient). */
function supabaseProxyPrefix(basePath: string): string {
  return basePath === '/' ? '/supabase' : `${basePath.replace(/\/$/, '')}/supabase`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const basePath = normalizeBase(process.env.VITE_BASE_PATH);
  const remoteSupabase = env.VITE_SUPABASE_URL?.replace(/\/+$/, '') || '';
  const proxyPrefix = supabaseProxyPrefix(basePath);

  return {
    base: basePath,
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
      proxy:
        mode === 'development' && remoteSupabase ?
          {
            [proxyPrefix]: {
              target: remoteSupabase,
              changeOrigin: true,
              secure: true,
              ws: true,
              rewrite: (p) => {
                const prefix = proxyPrefix;
                return p.startsWith(prefix) ? p.slice(prefix.length) || '/' : p;
              },
            },
          }
        : {},
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
  };
});
