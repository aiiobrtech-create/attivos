function geolocationErrorMessage(err: GeolocationPositionError | { code?: number; message?: string }): string {
  const code = 'code' in err ? err.code : undefined;
  if (code === 1) {
    return 'Permissão negada. Ative a localização para este site nas configurações do navegador.';
  }
  if (code === 2) {
    return 'Posição indisponível. Em computadores sem GPS isso é comum: use rede/Wi‑Fi, informe latitude e longitude manualmente ou tente no celular.';
  }
  if (code === 3) {
    return 'Tempo esgotado ao obter a posição. Tente de novo ou preencha as coordenadas manualmente.';
  }
  return err && typeof err === 'object' && 'message' in err && String((err as GeolocationPositionError).message)
    ? String((err as GeolocationPositionError).message)
    : 'Não foi possível obter a posição.';
}

function getCurrentPositionPromise(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

/**
 * Obtém coordenadas (HTTPS ou localhost + permissão).
 * Tenta primeiro com alta precisão (GPS); se falhar por indisponibilidade ou tempo, tenta de novo com rede/IP (melhor em desktop).
 */
export async function getDeviceGeolocation(): Promise<{ lat: number; lng: number }> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocalização não disponível neste navegador.');
  }

  const toCoords = (p: GeolocationPosition) => ({
    lat: p.coords.latitude,
    lng: p.coords.longitude,
  });

  try {
    const p = await getCurrentPositionPromise({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
    return toCoords(p);
  } catch (first: unknown) {
    const e = first as GeolocationPositionError;
    if (e?.code === 1) {
      throw new Error(geolocationErrorMessage(e));
    }
    // Código 2 (indisponível) ou 3 (timeout): comum em PC sem GPS — segunda tentativa só com rede
    try {
      const p = await getCurrentPositionPromise({
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 300000,
      });
      return toCoords(p);
    } catch (second: unknown) {
      const e2 = second as GeolocationPositionError;
      throw new Error(geolocationErrorMessage(e2));
    }
  }
}

export function parseCoordInput(raw: string): number | undefined {
  const t = raw.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

export function normalizeGeoPair(
  lat: number | undefined,
  lng: number | undefined
): { geo_lat?: number; geo_lng?: number } {
  const hasLat = lat != null && !Number.isNaN(lat);
  const hasLng = lng != null && !Number.isNaN(lng);
  if (!hasLat && !hasLng) return {};
  if (!hasLat || !hasLng) return {};
  const la = Math.max(-90, Math.min(90, lat!));
  const lo = Math.max(-180, Math.min(180, lng!));
  return { geo_lat: la, geo_lng: lo };
}

export function hasValidGeo(lat?: number | null, lng?: number | null): boolean {
  return (
    lat != null &&
    lng != null &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
