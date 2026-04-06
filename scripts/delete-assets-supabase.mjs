/**
 * Apaga somente ativos e registros vinculados (histórico, movimentações, manutenções, baixas).
 * Mantém categorias, localizações, centros de custo, fornecedores, audit_logs.
 *
 * Uso: npm run delete:assets -- --yes
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const yes = process.argv.includes('--yes') || process.env.ATTIVOS_RESET_CONFIRM === 'YES';

const CHILD_TABLES = ['asset_history', 'movements', 'maintenance_orders', 'disposals'];
const ASSETS_TABLE = 'assets';

if (!url || !serviceKey) {
  console.error('Defina VITE_SUPABASE_URL (ou SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY no .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function deleteAllFrom(table) {
  const sentinel = '__attivos_reset_sentinel__';
  const { error } = await admin.from(table).delete().neq('id', sentinel);
  if (error) throw new Error(`${table}: ${error.message}`);
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
    const a = await ask('Isso apaga TODOS os ativos e vínculos (manutenção, movimentações, etc.). Digite SIM: ');
    if (a.toLowerCase() !== 'sim') {
      console.log('Cancelado.');
      process.exit(0);
    }
  }

  console.log('Removendo registros vinculados a ativos...');
  for (const t of CHILD_TABLES) {
    await deleteAllFrom(t);
    console.log('  ok:', t);
  }
  await deleteAllFrom(ASSETS_TABLE);
  console.log('  ok:', ASSETS_TABLE);
  console.log('\nConcluído. Cadastros (categorias, locais, CC, fornecedores) foram mantidos.');
} catch (e) {
  console.error('Falha:', e?.message || e);
  process.exit(1);
}
