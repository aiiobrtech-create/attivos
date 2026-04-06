import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import type { Asset } from './types';
import { labelPayload } from './assetLabels';
import { fmtCurrency, fmtDate, STATUS_LABELS } from './utils';

/** Mesmo arquivo da tela de login (`public/logo.svg`). */
function loginLogoSvgUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base.endsWith('/') ? base : `${base}/`}logo.svg`;
}

/** Converte o SVG da logo em PNG (para o jsPDF). */
async function rasterizeLoginLogo(maxWidthPx = 560): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(loginLogoSvgUrl());
    if (!res.ok) return null;
    const svgText = await res.text();
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svg = doc.documentElement;
    let w = parseFloat(svg.getAttribute('width') || '0');
    let h = parseFloat(svg.getAttribute('height') || '0');
    if (!w || !h) {
      const vb = svg.getAttribute('viewBox');
      if (vb) {
        const p = vb.trim().split(/[\s,]+/).map(Number);
        if (p.length >= 4 && p[2] > 0 && p[3] > 0) {
          w = p[2];
          h = p[3];
        }
      }
    }
    if (!w || !h) {
      w = 200;
      h = 60;
    }
    const scale = maxWidthPx / w;
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('logo load'));
      i.src = blobUrl;
    });
    URL.revokeObjectURL(blobUrl);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return { dataUrl: canvas.toDataURL('image/png'), w: cw, h: ch };
  } catch {
    return null;
  }
}

export type AssetCardPdfContext = {
  asset: Asset;
  categoryName?: string;
  locationName?: string;
  costCenterName?: string;
  responsibleName?: string;
  supplierLine?: string;
};

/** PDF em formato “cartão” com dados do ativo, QR e código de barras. */
export async function downloadAssetCardPdf(ctx: AssetCardPdfContext): Promise<void> {
  const { asset, categoryName, locationName, costCenterName, responsibleName, supplierLine } = ctx;
  const payload = labelPayload(asset);
  if (!payload) return;

  const W = 100;
  const H = 158;
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });
  const brand: [number, number, number] = [79, 70, 229];
  const headerH = 13;

  doc.setFillColor(brand[0], brand[1], brand[2]);
  doc.rect(0, 0, W, headerH, 'F');

  const logo = await rasterizeLoginLogo();
  if (logo) {
    const aspect = logo.w / logo.h;
    const maxLogoW = W - 10;
    let logoHmm = 6.5;
    let logoWmm = logoHmm * aspect;
    if (logoWmm > maxLogoW) {
      logoWmm = maxLogoW;
      logoHmm = logoWmm / aspect;
    }
    const lx = (W - logoWmm) / 2;
    const ly = (headerH - logoHmm) / 2;
    doc.addImage(logo.dataUrl, 'PNG', lx, ly, logoWmm, logoHmm);
  }

  doc.setTextColor(28, 28, 30);
  let y = 18;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(asset.asset_code, 6, y);
  y += 5;
  if (asset.patrimonial_code) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 90);
    doc.text(`Patrimonial: ${asset.patrimonial_code}`, 6, y);
    y += 5;
    doc.setTextColor(28, 28, 30);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const descLines = doc.splitTextToSize(asset.description, W - 38).slice(0, 4);
  doc.text(descLines, 6, y);
  y += descLines.length * 4.2 + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(90, 90, 100);
  doc.text(`Status: ${STATUS_LABELS[asset.status] ?? asset.status}`, 6, y);
  y += 5;
  doc.setTextColor(28, 28, 30);

  const qrDataUrl = await QRCode.toDataURL(payload, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a1e', light: '#ffffff' },
  });
  const qrTop = y;
  doc.addImage(qrDataUrl, 'PNG', 6, qrTop, 28, 28);

  const colX = 38;
  let ty = qrTop + 2;
  const rows: [string, string][] = [
    ['Categoria', categoryName ?? '—'],
    ['Localização', locationName ?? '—'],
    ['Centro de custo', costCenterName ?? '—'],
    ['Responsável', responsibleName ?? '—'],
    ['Nº série', asset.serial_number || '—'],
    ['Valor aquisição', fmtCurrency(asset.acquisition_value)],
    ['Data compra', fmtDate(asset.acquisition_date)],
  ];
  if (supplierLine) rows.push(['Fornecedor', supplierLine]);

  doc.setFontSize(7.5);
  for (const [label, val] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, colX, ty);
    doc.setFont('helvetica', 'normal');
    const vs = doc.splitTextToSize(val, W - colX - 24);
    doc.text(vs, colX + 24, ty);
    ty += Math.max(4, vs.length * 3.2);
  }

  const afterCols = Math.max(qrTop + 30, ty) + 3;
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, payload, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 11,
    margin: 6,
    width: 1.6,
    height: 32,
    background: '#ffffff',
  });

  const barTargetW = W - 12;
  const scale = barTargetW / canvas.width;
  const barDrawH = canvas.height * scale;
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 6, afterCols, barTargetW, barDrawH);

  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 120);
  const footY = afterCols + barDrawH + 4;
  doc.text(`ID etiqueta (fixo): ${payload}`, W / 2, footY, { align: 'center', maxWidth: W - 8 });
  doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W / 2, footY + 4, { align: 'center' });

  const safe = asset.asset_code.replace(/[^\w\-]+/g, '_');
  doc.save(`cartao-ativo-${safe}.pdf`);
}
