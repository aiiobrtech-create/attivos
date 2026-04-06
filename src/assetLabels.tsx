import { useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';
import JsBarcode from 'jsbarcode';
import type { Asset } from './types';

/** Valor fixo das etiquetas (definido no cadastro). */
export function labelPayload(a: Pick<Asset, 'label_scan_value' | 'asset_code'>): string {
  return (a.label_scan_value || a.asset_code || '').trim();
}

export function AssetQrPreview({ value, size = 96 }: { value: string; size?: number }) {
  if (!value) {
    return (
      <div
        className="flex items-center justify-center text-black/40 font-mono text-[8px] text-center p-2 border border-dashed border-black/20"
        style={{ width: size, height: size }}
      >
        Defina o código do ativo
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-black/10 bg-white p-1">
      <QRCode value={value} size={size} level="M" />
    </div>
  );
}

export function AssetBarcodePreview({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el || !value) return;
    while (el.firstChild) el.removeChild(el.firstChild);
    try {
      JsBarcode(el, value, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 9,
        margin: 2,
        width: 1.2,
        height: 36,
        background: '#ffffff',
      });
    } catch {
      /* payload inválido para CODE128 */
    }
  }, [value]);

  if (!value) {
    return (
      <div className="flex h-12 w-full items-center justify-center bg-black/5 text-[9px] text-black/30">—</div>
    );
  }

  return <svg ref={svgRef} className="h-auto min-h-[48px] w-full max-w-full" />;
}
