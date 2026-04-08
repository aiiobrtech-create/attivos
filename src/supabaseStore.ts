import type { AppData, Asset, User } from './types';
import { supabase } from './supabaseClient';
import { parseProfileIdArray } from './userScope';

type DataTableName =
  | 'assets'
  | 'categories'
  | 'locations'
  | 'cost_centers'
  | 'maintenance_orders'
  | 'movements'
  | 'disposals'
  | 'suppliers'
  | 'audit_logs'
  | 'asset_history';

function requireSupabaseConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key) {
    throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  }
}

export function emptyAppData(): AppData {
  return {
    assets: [],
    categories: [],
    locations: [],
    costCenters: [],
    users: [],
    maintenanceOrders: [],
    movements: [],
    disposals: [],
    suppliers: [],
    auditLogs: [],
    assetHistory: [],
  };
}

export function profileRowToUser(row: {
  id: string;
  email: string;
  name: string;
  role: string;
  allowed_location_ids?: unknown;
  allowed_cost_center_ids?: unknown;
}): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    allowed_location_ids: parseProfileIdArray(row.allowed_location_ids),
    allowed_cost_center_ids: parseProfileIdArray(row.allowed_cost_center_ids),
  };
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Erros comuns de rede no browser / fetch que costumam ser transitórios. */
function isTransientNetworkError(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message).toLowerCase()
      : String(err).toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('fetch failed') ||
    msg.includes('aborted') ||
    msg.includes('timeout')
  );
}

/**
 * SELECT * com retentativa. Evita falhas esporádicas; não mascara erro de RLS/schema.
 */
async function selectAllRows(table: string): Promise<any[]> {
  const maxAttempts = 3;
  const backoffMs = [0, 700, 1800];
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (backoffMs[attempt]) await sleep(backoffMs[attempt]);
    try {
      const { data, error } = await supabase.from(table).select('*');
      if (error) {
        lastErr = error;
        if (isTransientNetworkError(error) && attempt < maxAttempts - 1) continue;
        throw error;
      }
      return data || [];
    } catch (e) {
      lastErr = e;
      if (isTransientNetworkError(e) && attempt < maxAttempts - 1) continue;
      throw e;
    }
  }
  throw lastErr;
}

function ids(list: { id: string }[]) {
  return new Set(list.map((x) => x.id));
}

function diffRemovedIds(prev: { id: string }[], next: { id: string }[]): string[] {
  const nextIds = ids(next);
  return prev.filter((x) => !nextIds.has(x.id)).map((x) => x.id);
}

async function upsertAll(table: DataTableName, rows: any[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

async function deleteByIds(table: DataTableName, removedIds: string[]) {
  if (removedIds.length === 0) return;
  const { error } = await supabase.from(table).delete().in('id', removedIds);
  if (error) throw error;
}

/** Limita paralelismo para não saturar conexões no browser. */
async function runInChunks(tasks: (() => Promise<unknown>)[], chunkSize: number) {
  for (let i = 0; i < tasks.length; i += chunkSize) {
    const slice = tasks.slice(i, i + chunkSize);
    await Promise.all(slice.map((t) => t()));
  }
}

/** Remove filhos no DB quando ativos somem (FKs ou consistência), antes de apagar o ativo. */
async function deleteChildRowsForRemovedAssets(assetIds: string[]) {
  if (assetIds.length === 0) return;
  const tables: DataTableName[] = [
    'asset_history',
    'movements',
    'maintenance_orders',
    'disposals',
  ];
  await runInChunks(
    tables.map(
      (table) => async () => {
        const { error } = await supabase.from(table).delete().in('asset_id', assetIds);
        if (error) throw error;
      }
    ),
    2
  );
}

/** Colunas existentes em public.assets (evita 400 no upsert por campos extras do formulário). */
const ASSET_DB_KEYS = [
  'id',
  'asset_code',
  'patrimonial_code',
  'description',
  'status',
  'category_id',
  'cost_center_id',
  'location_id',
  'responsible_id',
  'supplier_id',
  'acquisition_value',
  'acquisition_date',
  'serial_number',
  'manufacturer',
  'brand',
  'model',
  'invoice_number',
  'useful_life_months',
  'observations',
  'photo_url',
  'label_scan_value',
  'geo_lat',
  'geo_lng',
] as const;

function sanitizeAssetRow(row: Asset): Asset {
  const o = {} as Asset;
  for (const k of ASSET_DB_KEYS) {
    const key = k as keyof Asset;
    if (key in row && row[key] !== undefined) (o as any)[key] = row[key];
  }
  return o;
}

function toDbRows(app: AppData) {
  return {
    assets: app.assets.map((a) => sanitizeAssetRow(a)),
    categories: app.categories,
    locations: app.locations,
    cost_centers: app.costCenters,
    maintenance_orders: app.maintenanceOrders,
    movements: app.movements,
    disposals: app.disposals,
    suppliers: app.suppliers,
    audit_logs: app.auditLogs,
    asset_history: app.assetHistory,
  };
}

/** Evita reenviar ao Supabase linhas órfãs (ex.: manutenção de ativo já removido). */
function dropPatrimonioRowsForMissingAssets(next: AppData): AppData {
  const ids = new Set(next.assets.map((a) => a.id));
  return {
    ...next,
    maintenanceOrders: next.maintenanceOrders.filter((m) => ids.has(m.asset_id)),
    movements: next.movements.filter((m) => ids.has(m.asset_id)),
    disposals: next.disposals.filter((d) => ids.has(d.asset_id)),
    assetHistory: next.assetHistory.filter((h) => ids.has(h.asset_id)),
  };
}

function fromDbRows(db: any): AppData {
  const profs = db.profiles ?? [];
  const users: User[] = profs.map((p: any) =>
    profileRowToUser({
      id: p.id,
      email: p.email,
      name: p.name,
      role: p.role,
    })
  );
  return {
    assets: db.assets ?? [],
    categories: db.categories ?? [],
    locations: db.locations ?? [],
    costCenters: db.cost_centers ?? [],
    users,
    maintenanceOrders: db.maintenance_orders ?? [],
    movements: db.movements ?? [],
    disposals: db.disposals ?? [],
    suppliers: db.suppliers ?? [],
    auditLogs: db.audit_logs ?? [],
    assetHistory: db.asset_history ?? [],
  };
}

async function selectAllDataTable(table: DataTableName) {
  return selectAllRows(table);
}

export async function loadAppDataFromSupabase(): Promise<AppData> {
  requireSupabaseConfigured();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return emptyAppData();
  }

  // Sequencial: 11 SELECT em paralelo estoura limite de conexões HTTP/1.1 no browser e gera "Failed to fetch".
  const assets = await selectAllDataTable('assets');
  const categories = await selectAllDataTable('categories');
  const locations = await selectAllDataTable('locations');
  const cost_centers = await selectAllDataTable('cost_centers');
  const profiles = await selectAllRows('profiles');
  const maintenance_orders = await selectAllDataTable('maintenance_orders');
  const movements = await selectAllDataTable('movements');
  const disposals = await selectAllDataTable('disposals');
  const suppliers = await selectAllDataTable('suppliers');
  const audit_logs = await selectAllDataTable('audit_logs');
  const asset_history = await selectAllDataTable('asset_history');

  return fromDbRows({
    assets,
    categories,
    locations,
    cost_centers,
    profiles,
    maintenance_orders,
    movements,
    disposals,
    suppliers,
    audit_logs,
    asset_history,
  });
}

export async function seedSupabaseIfEmpty(
  app: AppData,
  opts?: { defaultResponsibleId?: string }
): Promise<void> {
  requireSupabaseConfigured();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return;

  const categories = await selectAllDataTable('categories');
  const assets = await selectAllDataTable('assets');
  if ((categories?.length || 0) > 0 || (assets?.length || 0) > 0) return;

  const respId = opts?.defaultResponsibleId || '';
  const assetsSeed = app.assets.map((a) => ({
    ...a,
    responsible_id: respId || a.responsible_id,
  }));

  const db = toDbRows({ ...app, users: [], assets: assetsSeed });

  await upsertAll('categories', db.categories);
  await upsertAll('cost_centers', db.cost_centers);
  await upsertAll('locations', db.locations);
  await upsertAll('suppliers', db.suppliers);

  await upsertAll('assets', db.assets);
  await upsertAll('maintenance_orders', db.maintenance_orders);
  await upsertAll('movements', db.movements);
  await upsertAll('disposals', db.disposals);
  await upsertAll('asset_history', db.asset_history);
  await upsertAll('audit_logs', db.audit_logs);
}

export async function syncAppDataToSupabase(prev: AppData, next: AppData): Promise<void> {
  requireSupabaseConfigured();
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    throw new Error('Sessão expirada ou indisponível. Faça login novamente para sincronizar.');
  }

  const nextSafe = dropPatrimonioRowsForMissingAssets(next);
  const p = toDbRows(prev);
  const n = toDbRows(nextSafe);

  const removedAssetIds = diffRemovedIds(p.assets, n.assets);
  if (removedAssetIds.length > 0) {
    await deleteChildRowsForRemovedAssets(removedAssetIds);
  }

  await runInChunks(
    [
      () => deleteByIds('asset_history', diffRemovedIds(p.asset_history, n.asset_history)),
      () => deleteByIds('audit_logs', diffRemovedIds(p.audit_logs, n.audit_logs)),
      () => deleteByIds('disposals', diffRemovedIds(p.disposals, n.disposals)),
      () => deleteByIds('movements', diffRemovedIds(p.movements, n.movements)),
      () => deleteByIds('maintenance_orders', diffRemovedIds(p.maintenance_orders, n.maintenance_orders)),
      () => deleteByIds('suppliers', diffRemovedIds(p.suppliers, n.suppliers)),
      () => deleteByIds('locations', diffRemovedIds(p.locations, n.locations)),
      () => deleteByIds('cost_centers', diffRemovedIds(p.cost_centers, n.cost_centers)),
      () => deleteByIds('categories', diffRemovedIds(p.categories, n.categories)),
    ],
    4
  );

  if (removedAssetIds.length > 0) {
    await deleteByIds('assets', removedAssetIds);
  }

  await upsertAll('categories', n.categories);
  await upsertAll('cost_centers', n.cost_centers);
  await upsertAll('locations', n.locations);
  await upsertAll('suppliers', n.suppliers);

  await upsertAll('assets', n.assets);
  await upsertAll('maintenance_orders', n.maintenance_orders);
  await upsertAll('movements', n.movements);
  await upsertAll('disposals', n.disposals);
  await upsertAll('asset_history', n.asset_history);
  await upsertAll('audit_logs', n.audit_logs);
}
