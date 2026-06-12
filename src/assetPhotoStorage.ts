import { supabase } from './supabaseClient';

export const ASSET_PHOTOS_BUCKET = 'asset-photos';
export const MAX_ASSET_PHOTOS = 10;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function extensionFromMime(mime: string, fallbackName: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  if (map[mime]) return map[mime];
  const fromName = fallbackName.split('.').pop()?.toLowerCase();
  if (fromName && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) {
    return fromName === 'jpeg' ? 'jpg' : fromName;
  }
  return 'jpg';
}

export function getAssetPhotoUrls(asset: { photo_urls?: string[] | null; photo_url?: string | null }): string[] {
  if (Array.isArray(asset.photo_urls) && asset.photo_urls.length) {
    return asset.photo_urls.filter((u): u is string => typeof u === 'string' && u.length > 0);
  }
  if (asset.photo_url) return [asset.photo_url];
  return [];
}

/** Normaliza lista de URLs para persistência (photo_urls + photo_url legado). */
export function buildAssetPhotoFields(urls: string[]): {
  photo_url: string | null;
  photo_urls: string[] | null;
} {
  const clean = urls.filter(Boolean).slice(0, MAX_ASSET_PHOTOS);
  if (!clean.length) return { photo_url: null, photo_urls: null };
  return { photo_url: clean[0], photo_urls: clean };
}

export function validateAssetPhotoFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return 'Use imagem JPEG, PNG, WebP ou GIF.';
  }
  if (file.size > MAX_BYTES) {
    return 'A imagem deve ter no máximo 5 MB.';
  }
  return null;
}

/** Extrai o caminho no bucket a partir da URL pública do Supabase Storage. */
export function tryParseAssetPhotoStoragePath(publicUrl: string): string | null {
  if (!publicUrl || typeof publicUrl !== 'string') return null;
  const marker = `/object/public/${ASSET_PHOTOS_BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  try {
    return decodeURIComponent(publicUrl.slice(i + marker.length).split('?')[0]);
  } catch {
    return publicUrl.slice(i + marker.length).split('?')[0];
  }
}

export function isAssetPhotoStorageUrl(url: string | undefined): boolean {
  if (!url) return false;
  return tryParseAssetPhotoStoragePath(url) != null;
}

export async function uploadAssetPhoto(file: File, assetId: string): Promise<string> {
  const err = validateAssetPhotoFile(file);
  if (err) throw new Error(err);

  const ext = extensionFromMime(file.type || 'image/jpeg', file.name);
  const path = `assets/${assetId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const { error } = await supabase.storage.from(ASSET_PHOTOS_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(ASSET_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Remove o objeto apontado pela URL pública. Retorna false se o Storage retornou erro. */
export async function removeAssetPhotoByUrl(publicUrl: string): Promise<boolean> {
  const path = tryParseAssetPhotoStoragePath(publicUrl);
  if (!path) return true;
  const { error } = await supabase.storage.from(ASSET_PHOTOS_BUCKET).remove([path]);
  if (error) {
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('not found') || msg.includes('object not found')) return true;
    console.warn('removeAssetPhotoByUrl:', error);
    return false;
  }
  return true;
}

/** Remove várias fotos do Storage; retorna URLs que falharam. */
export async function removeAssetPhotosByUrls(urls: string[]): Promise<string[]> {
  const failed: string[] = [];
  for (const url of urls) {
    if (!isAssetPhotoStorageUrl(url)) continue;
    const ok = await removeAssetPhotoByUrl(url);
    if (!ok) failed.push(url);
  }
  return failed;
}

/**
 * Após excluir o ativo no banco: remove objetos em `assets/{assetId}/` e URLs conhecidas.
 * Retorna false se o Storage reportou erro em alguma etapa relevante; true se não havia nada a limpar ou tudo ok.
 */
export async function removeStorageForDeletedAsset(
  assetId: string,
  knownPhotoUrls?: string[] | null
): Promise<boolean> {
  let anyFailure = false;
  const folder = `assets/${assetId}`;
  const { data: items, error: listErr } = await supabase.storage.from(ASSET_PHOTOS_BUCKET).list(folder, { limit: 200 });
  if (listErr) {
    console.warn('removeStorageForDeletedAsset list:', listErr);
    anyFailure = true;
  } else if (items?.length) {
    const paths = items.map((it) => `${folder}/${it.name}`);
    const { error: removeErr } = await supabase.storage.from(ASSET_PHOTOS_BUCKET).remove(paths);
    if (removeErr) {
      console.warn('removeStorageForDeletedAsset remove:', removeErr);
      anyFailure = true;
    }
  }
  const urls = [...new Set((knownPhotoUrls ?? []).filter(isAssetPhotoStorageUrl))];
  for (const url of urls) {
    const ok = await removeAssetPhotoByUrl(url);
    if (!ok) anyFailure = true;
  }
  const hadKnownUrls = urls.length > 0;
  const hadFolderFiles = !listErr && (items?.length ?? 0) > 0;
  const nothingToDo = !hadFolderFiles && !hadKnownUrls && !listErr;
  if (nothingToDo) return true;
  return !anyFailure;
}
