import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import { hasValidGeo } from './geoUtils';

const MAP_HEIGHT = 280;

/** Mapa embutido (Google). Sem VITE_GOOGLE_MAPS_API_KEY usa embed genérico (pode ser bloqueado em alguns ambientes). */
export function AssetGeoMap({
  lat,
  lng,
  className = '',
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  if (!hasValidGeo(lat, lng)) return null;

  const key = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
  const src = key
    ? `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(key)}&center=${lat},${lng}&zoom=16&maptype=roadmap`
    : `https://maps.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}&z=16&output=embed&hl=pt-BR`;

  const openUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-xl border border-border bg-bg4/30">
        <iframe
          title="Mapa — localização do ativo"
          className="w-full border-0"
          style={{ height: MAP_HEIGHT }}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={src}
          allowFullScreen
        />
      </div>
      <a
        href={openUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold text-brand2 hover:underline"
      >
        <ExternalLink size={12} />
        Abrir no Google Maps
      </a>
    </div>
  );
}

export function formatGeoCoords(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}
