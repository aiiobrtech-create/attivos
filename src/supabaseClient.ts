import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true se URL e chave anon existem (valores vindos do build Vite / .env). */
export const supabaseConfigured =
  typeof supabaseUrl === 'string' &&
  supabaseUrl.trim().length > 0 &&
  typeof supabaseAnonKey === 'string' &&
  supabaseAnonKey.trim().length > 0;

if (!supabaseConfigured) {
  console.warn('Supabase não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

/**
 * Testa se o host do projeto responde (sem autenticar). Útil para diagnosticar "Failed to fetch".
 */
export async function checkSupabaseReachable(): Promise<'ok' | 'misconfigured' | 'unreachable'> {
  if (!supabaseConfigured || !supabaseUrl) return 'misconfigured';
  const base = supabaseUrl.replace(/\/+$/, '');
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 15000);
    // O endpoint costuma responder 401 sem apikey; o importante é não lançar (rede/host OK).
    await fetch(`${base}/auth/v1/health`, { method: 'GET', signal: ctrl.signal });
    window.clearTimeout(timer);
    return 'ok';
  } catch {
    return 'unreachable';
  }
}

