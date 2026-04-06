import type { AppData, Asset, CostCenter, Location, User } from './types';

/** Normaliza arrays vindos do JSONB do Supabase. */
export function parseProfileIdArray(v: unknown): string[] | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return undefined;
}

export function assetMatchesUserScope(asset: Asset, user: User | null): boolean {
  if (!user || user.role === 'admin') return true;
  const locs = user.allowed_location_ids;
  const ccs = user.allowed_cost_center_ids;
  const hasLoc = Array.isArray(locs) && locs.length > 0;
  const hasCc = Array.isArray(ccs) && ccs.length > 0;
  if (!hasLoc && !hasCc) return true;
  if (hasLoc && !locs!.includes(asset.location_id)) return false;
  if (hasCc && !ccs!.includes(asset.cost_center_id)) return false;
  return true;
}

/** Visão filtrada de patrimônio (ativos e registros ligados a eles). Admins não são filtrados. */
export function filterAppDataByUserScope(data: AppData, user: User | null): AppData {
  if (!user || user.role === 'admin') return data;
  const locs = user.allowed_location_ids;
  const ccs = user.allowed_cost_center_ids;
  const hasLoc = Array.isArray(locs) && locs.length > 0;
  const hasCc = Array.isArray(ccs) && ccs.length > 0;
  if (!hasLoc && !hasCc) return data;

  const assets = data.assets.filter((a) => assetMatchesUserScope(a, user));
  const assetIds = new Set(assets.map((a) => a.id));

  return {
    ...data,
    assets,
    maintenanceOrders: data.maintenanceOrders.filter((m) => assetIds.has(m.asset_id)),
    movements: data.movements.filter((m) => assetIds.has(m.asset_id)),
    disposals: data.disposals.filter((d) => assetIds.has(d.asset_id)),
    assetHistory: data.assetHistory.filter((h) => assetIds.has(h.asset_id)),
  };
}

export function filterLocationsForUserPick(locations: Location[], user: User | null): Location[] {
  if (!user || user.role === 'admin') return locations;
  const ids = user.allowed_location_ids;
  if (!ids?.length) return locations;
  return locations.filter((l) => ids.includes(l.id));
}

export function filterCostCentersForUserPick(costCenters: CostCenter[], user: User | null): CostCenter[] {
  if (!user || user.role === 'admin') return costCenters;
  const ids = user.allowed_cost_center_ids;
  if (!ids?.length) return costCenters;
  return costCenters.filter((c) => ids.includes(c.id));
}

export function filterAssetsForUserPick(assets: Asset[], user: User | null, keepAssetId?: string): Asset[] {
  if (!user || user.role === 'admin') return assets;
  return assets.filter((a) => assetMatchesUserScope(a, user) || (!!keepAssetId && a.id === keepAssetId));
}

export function scopeSummaryLabel(user: User): string {
  const nL = user.allowed_location_ids?.length ?? 0;
  const nC = user.allowed_cost_center_ids?.length ?? 0;
  if (!nL && !nC) return '—';
  const parts: string[] = [];
  if (nL) parts.push(`${nL} loc.`);
  if (nC) parts.push(`${nC} CC`);
  return parts.join(' ');
}

export function validateAssetWithinUserScope(
  asset: Pick<Asset, 'location_id' | 'cost_center_id'>,
  user: User | null
): string | null {
  if (!user || user.role === 'admin') return null;
  const locs = user.allowed_location_ids;
  const ccs = user.allowed_cost_center_ids;
  if (locs?.length && !locs.includes(asset.location_id)) {
    return 'Localização fora do escopo permitido para o seu usuário.';
  }
  if (ccs?.length && !ccs.includes(asset.cost_center_id)) {
    return 'Centro de custo fora do escopo permitido para o seu usuário.';
  }
  return null;
}
