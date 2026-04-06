/**
 * Garante o administrador principal no Supabase Auth + public.profiles.
 * Requer SUPABASE_SERVICE_ROLE_KEY (Settings → API; não use no app Vite).
 *
 * Uso: npm run seed:admin
 * Variáveis: .env (ver .env.example)
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.ATTIVOS_ADMIN_EMAIL || 'renan@reetech.com.br').trim().toLowerCase();
const password = process.env.ATTIVOS_ADMIN_PASSWORD;
const name = (process.env.ATTIVOS_ADMIN_NAME || 'Renan').trim();

if (!url || !serviceKey) {
  console.error('Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}
if (!password) {
  console.error('Defina ATTIVOS_ADMIN_PASSWORD no .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(target) {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((u) => (u.email || '').toLowerCase() === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

try {
  const existing = await findUserByEmail(email);

  if (existing) {
    const { error: uerr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata || {}), name, role: 'admin' },
    });
    if (uerr) throw uerr;

    const { error: perr } = await admin
      .from('profiles')
      .update({ name, email, role: 'admin' })
      .eq('id', existing.id);
    if (perr) throw perr;

    console.log('OK — usuário existente atualizado como administrador:', email);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'admin' },
    });
    if (error) throw error;

    const { error: perr } = await admin
      .from('profiles')
      .update({ name, email, role: 'admin' })
      .eq('id', data.user.id);
    if (perr) {
      console.warn('Aviso — perfil pode ter sido criado só pelo trigger:', perr.message);
    }

    console.log('OK — usuário criado como administrador:', email);
  }
} catch (e) {
  console.error('Falha:', e?.message || e);
  process.exit(1);
}
