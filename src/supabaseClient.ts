import { createClient } from '@supabase/supabase-js';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true se URL e chave anon existem (valores vindos do build Vite / .env). */
export const supabaseConfigured =
  typeof envSupabaseUrl === 'string' &&
  envSupabaseUrl.trim().length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.trim().length > 0;

if (!supabaseConfigured) {
  console.warn('Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

/**
 * URL efetiva para Auth/REST/Realtime no browser.
 * Em dev, usa o proxy do Vite (`/supabase` → projeto remoto) para evitar CORS ao abrir pelo IP da rede.
 */
export function getSupabaseHttpBase(): string {
  const remote = envSupabaseUrl?.trim().replace(/\/+$/, '') || '';
  if (!remote) return '';
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const baseUrl = import.meta.env.BASE_URL;
    const pathSeg =
      baseUrl === '/' ? '/supabase' : `${baseUrl.replace(/\/$/, '')}/supabase`;
    return `${window.location.origin}${pathSeg}`;
  }
  return remote;
}

export const supabase = createClient(getSupabaseHttpBase(), supabaseAnonKey || '');

/**
 * Testa se o host do projeto responde no navegador.
 *
 * Nota: alguns endpoints de health podem não expor CORS sem `apikey`, o que vira
 * "Failed to fetch" no browser mesmo com o host online. Por isso usamos `/rest/v1/`
 * com headers padrão do Supabase.
 */
export async function checkSupabaseReachable(): Promise<'ok' | 'misconfigured' | 'unreachable'> {
  if (!supabaseConfigured || !envSupabaseUrl || !supabaseAnonKey) return 'misconfigured';
  const base = getSupabaseHttpBase().replace(/\/+$/, '');
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 15000);
    // Qualquer resposta (200/401/404) é suficiente: o importante é o fetch não lançar.
    await fetch(`${base}/rest/v1/`, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });
    window.clearTimeout(timer);
    return 'ok';
  } catch {
    return 'unreachable';
  }
}

