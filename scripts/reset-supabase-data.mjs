/**
 * Apaga dados das tabelas públicas do ATTIVOS no Supabase (patrimônio + cadastros + logs).
 * Usa SUPABASE_SERVICE_ROLE_KEY (mesmo .env do seed:admin).
 *
 * Uso:
 *   ATTIVOS_RESET_CONFIRM=YES npm run reset:data
 *   npm run reset:data -- --yes
 *
 * Opcional — apaga também todos os usuários do Auth (perfis somem em cascata):
 *   npm run reset:data -- --yes --with-auth
 * Depois rode: npm run seed:admin
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const yes = process.argv.includes('--yes') || process.env.ATTIVOS_RESET_CONFIRM === 'YES';
const withAuth = process.argv.includes('--with-auth');

const TABLES = [
  'asset_history',
  'audit_logs',
  'disposals',
  'movements',
  'maintenance_orders',
  'assets',
  'suppliers',
  'locations',
  'cost_centers',
  'categories',
];

if (!url || !serviceKey) {
  console.error('Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** PostgREST: apaga todas as linhas (nenhum id real será igual ao sentinela). */
async function deleteAllFrom(table) {
  const sentinel = '__attivos_reset_sentinel__';
  const { error } = await admin.from(table).delete().neq('id', sentinel);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function deleteAllAuthUsers() {
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
      if (delErr) throw delErr;
      console.log('  removido auth:', u.email || u.id);
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

try {
  if (!yes) {
    const a = await ask(
      'Isso apaga TODO o patrimônio e cadastros no Supabase deste projeto. Digite SIM para continuar: '
    );
    if (a.toLowerCase() !== 'sim') {
      console.log('Cancelado.');
      process.exit(0);
    }
    if (withAuth) {
      const b = await ask('Com --with-auth: todos os logins serão removidos. Digite SIM de novo: ');
      if (b.toLowerCase() !== 'sim') {
        console.log('Cancelado.');
        process.exit(0);
      }
    }
  }

  console.log('Limpando tabelas public...');
  for (const t of TABLES) {
    await deleteAllFrom(t);
    console.log('  ok:', t);
  }

  if (withAuth) {
    console.log('Removendo usuários do Auth...');
    await deleteAllAuthUsers();
    console.log('  perfis em public.profiles foram removidos em cascata (se o FK existir).');
  }

  console.log('\nConcluído. Banco patrimonial vazio.');
  if (withAuth) {
    console.log('Crie o admin de novo: npm run seed:admin');
  } else {
    console.log('Faça login no app — os usuários existentes continuam válidos.');
  }
} catch (e) {
  console.error('Falha:', e?.message || e);
  process.exit(1);
}
