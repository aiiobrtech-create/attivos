import type { AppData, Category, CostCenter, Location, User } from './types';
import {
  ASSET_IMPORT_STATUS_COLUMN,
  ASSET_IMPORT_STATUS_COLUMN_LEGACY,
  isValidImportStatusText,
} from './utils';

export type ImportPrereqResult =
  | { ok: true }
  | { ok: false; message: string; log: string };

/** Cadastros mínimos para importar ativos (Configurações + usuários com perfil). */
export function validateImportPrerequisites(data: AppData): ImportPrereqResult {
  const missing: string[] = [];
  if (data.categories.length === 0) missing.push('categoria');
  if (data.costCenters.length === 0) missing.push('centro de custo');
  if (data.locations.length === 0) missing.push('localização');
  if (data.users.length === 0) missing.push('usuário (responsável)');

  if (missing.length > 0) {
    const message = `Importação bloqueada: cadastre ao menos um(a): ${missing.join(', ')} em Configurações / Usuários.`;
    const log = `[Importação CSV — pré-requisitos]\n${message}`;
    return { ok: false, message, log };
  }
  return { ok: true };
}

function norm(s: unknown): string {
  return String(s ?? '').trim();
}

export type ResolvedImportRefs = {
  category: Category;
  costCenter: CostCenter;
  location: Location;
  responsible: User;
  statusRaw: string;
};

export type RowValidationResult =
  | { ok: true; line: number; refs: ResolvedImportRefs }
  | { ok: false; line: number; errors: string[] };

/** Valida uma linha do CSV (sem fallback para primeiro item da lista). */
export function validateAssetImportRow(
  row: Record<string, unknown>,
  line: number,
  data: AppData
): RowValidationResult {
  const errors: string[] = [];

  const desc = norm(row['Descrição']);
  if (!desc) errors.push('Descrição é obrigatória');

  const catName = norm(row['Categoria']);
  if (!catName) errors.push('Categoria é obrigatória');
  const category = data.categories.find(
    (c) => c.name.trim().toLowerCase() === catName.toLowerCase()
  );
  if (catName && !category) errors.push(`Categoria "${catName}" não existe no cadastro`);

  const ccName = norm(row['Centro de Custo']);
  if (!ccName) errors.push('Centro de Custo é obrigatório');
  const costCenter = data.costCenters.find(
    (c) => c.name.trim().toLowerCase() === ccName.toLowerCase()
  );
  if (ccName && !costCenter) errors.push(`Centro de Custo "${ccName}" não existe no cadastro`);

  const locName = norm(row['Localização']);
  if (!locName) errors.push('Localização é obrigatória');
  const location = data.locations.find(
    (l) => l.name.trim().toLowerCase() === locName.toLowerCase()
  );
  if (locName && !location) errors.push(`Localização "${locName}" não existe no cadastro`);

  const email = norm(row['Responsável (E-mail)']).toLowerCase();
  if (!email) errors.push('Responsável (E-mail) é obrigatório');
  const responsible = data.users.find((u) => u.email.trim().toLowerCase() === email);
  if (email && !responsible) errors.push(`Nenhum usuário com e-mail "${email}"`);

  const statusRaw = norm(row[ASSET_IMPORT_STATUS_COLUMN] ?? row[ASSET_IMPORT_STATUS_COLUMN_LEGACY]);
  if (!statusRaw) errors.push('Status é obrigatório');
  else if (!isValidImportStatusText(statusRaw)) {
    errors.push(
      `Status "${statusRaw}" inválido (ex.: Ativo, Em Manutenção, Transferido, Baixado, Furtado, Sucateado, Inativo ou as chaves em inglês)`
    );
  }

  const dateStr = norm(row['Data de Aquisição (YYYY-MM-DD)']);
  if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    errors.push(`Data de Aquisição deve estar no formato AAAA-MM-DD (recebido: "${dateStr}")`);
  }

  if (errors.length > 0) return { ok: false, line, errors };

  return {
    ok: true,
    line,
    refs: {
      category: category!,
      costCenter: costCenter!,
      location: location!,
      responsible: responsible!,
      statusRaw,
    },
  };
}

/** Ignora linha totalmente vazia (última linha do Excel, etc.). */
export function isCsvRowEffectivelyEmpty(row: Record<string, unknown>): boolean {
  return Object.values(row).every((v) => norm(v) === '');
}
