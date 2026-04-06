import { supabase } from './supabaseClient';

function functionsBase(): string {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  return `${url.replace(/\/$/, '')}/functions/v1`;
}

function anonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY as string;
}

export async function invokeAdminCreateUser(body: {
  email: string;
  password: string;
  name: string;
  role: string;
}): Promise<{ userId: string }> {
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData.session) {
    throw new Error('Sessão expirada. Entre novamente.');
  }
  const res = await fetch(`${functionsBase()}/admin-create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: anonKey(),
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; userId?: string };
  if (!res.ok) {
    throw new Error(json.error || res.statusText || 'Falha ao criar usuário');
  }
  if (!json.userId) {
    throw new Error('Resposta inválida da função admin-create-user');
  }
  return { userId: json.userId };
}

export async function invokeAdminUpdateUserPassword(userId: string, password: string): Promise<void> {
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData.session) {
    throw new Error('Sessão expirada. Entre novamente.');
  }
  const res = await fetch(`${functionsBase()}/admin-update-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: anonKey(),
    },
    body: JSON.stringify({ userId, password }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || res.statusText || 'Falha ao atualizar senha');
  }
}

export async function invokeAdminDeleteUser(userId: string): Promise<void> {
  const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
  if (sessErr || !sessionData.session) {
    throw new Error('Sessão expirada. Entre novamente.');
  }
  const res = await fetch(`${functionsBase()}/admin-delete-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData.session.access_token}`,
      apikey: anonKey(),
    },
    body: JSON.stringify({ userId }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(json.error || res.statusText || 'Falha ao excluir usuário');
  }
}
