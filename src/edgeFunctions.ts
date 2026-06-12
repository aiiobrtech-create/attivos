import { getSupabaseHttpBase, supabase } from './supabaseClient';

function functionsBase(): string {
  const url = getSupabaseHttpBase();
  return `${url.replace(/\/$/, '')}/functions/v1`;
}

function anonKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY as string;
}

function formatInvokeFailure(res: Response, rawBody: string): string {
  let parsed: { error?: string; message?: string } = {};
  try {
    parsed = JSON.parse(rawBody) as { error?: string; message?: string };
  } catch {
    /* corpo HTML ou texto simples */
  }
  const fromBody = (parsed.error || parsed.message || '').trim();
  if (res.status === 404) {
    return (
      fromBody ||
      'Função Edge não encontrada (404). Faça deploy das funções admin-create-user, admin-update-user e admin-delete-user (Supabase → Edge Functions).'
    );
  }
  return fromBody || res.statusText || `HTTP ${res.status}`;
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
  const raw = await res.text();
  let json = {} as { error?: string; userId?: string };
  try {
    json = JSON.parse(raw) as { error?: string; userId?: string };
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(formatInvokeFailure(res, raw) || 'Falha ao criar usuário');
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
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(formatInvokeFailure(res, raw) || 'Falha ao atualizar senha');
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
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(formatInvokeFailure(res, raw) || 'Falha ao excluir usuário');
  }
}
