import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AssetStatus } from './types';

export const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  maintenance: 'Em Manutenção',
  transferred: 'Transferido',
  disposed: 'Baixado',
  stolen: 'Furtado',
  scrapped: 'Sucateado',
  inactive: 'Inativo'
};

export const STATUS_COLORS: Record<string, string> = {
  active: 'b-active',
  maintenance: 'b-maintenance',
  transferred: 'b-transferred',
  disposed: 'b-disposed',
  stolen: 'b-disposed',
  scrapped: 'b-disposed',
  inactive: 'b-inactive'
};

export const STATUS_DOTS: Record<string, string> = {
  active: '#22c55e',
  maintenance: '#f97316',
  transferred: '#6366f1',
  disposed: '#ef4444',
  stolen: '#dc2626',
  scrapped: '#6b7280',
  inactive: '#4b5563'
};

export const MAINT_LABELS: Record<string, string> = {
  preventive: 'Preventiva',
  corrective: 'Corretiva'
};

export const MAINT_STATUS_LABELS: Record<string, string> = {
  open: 'Em Aberto',
  in_progress: 'Em Andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada'
};

export const DISPOSAL_LABELS: Record<string, string> = {
  sale: 'Venda',
  scrap: 'Sucateamento',
  theft: 'Furto',
  loss: 'Extravio',
  obsolescence: 'Obsolescência',
  donation: 'Doação',
  other: 'Outro'
};

/** Tipos de movimentação — chaves internas em inglês, rótulos em português. */
export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  transfer: 'Transferência',
  loan: 'Empréstimo',
  return: 'Devolução',
};

/** Perfis de usuário — mesmos valores salvos em `role`. */
export const USER_ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor_patrimonial: 'Gestor patrimonial',
  operador: 'Operador',
  auditor: 'Auditor',
  viewer: 'Visualizador',
};

/** Coluna de status no modelo de importação (valores em português, ex.: Ativo). */
export const ASSET_IMPORT_STATUS_COLUMN = 'Status';

/** Cabeçalho antigo do modelo — ainda aceito na importação. */
export const ASSET_IMPORT_STATUS_COLUMN_LEGACY =
  'Status (active, maintenance, transferred, disposed, stolen, scrapped, inactive)';

const ASSET_STATUS_KEYS: AssetStatus[] = [
  'active',
  'maintenance',
  'transferred',
  'disposed',
  'stolen',
  'scrapped',
  'inactive',
];

/** Converte texto da planilha (rótulo em PT ou chave em EN) para `AssetStatus`. */
export function parseImportedAssetStatus(raw: string | undefined): AssetStatus {
  const t = (raw ?? '').trim();
  if (!t) return 'active';
  const lower = t.toLowerCase();
  if (ASSET_STATUS_KEYS.includes(lower as AssetStatus)) return lower as AssetStatus;
  const norm = t.normalize('NFC').toLowerCase();
  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    if (label.normalize('NFC').toLowerCase() === norm) return key as AssetStatus;
  }
  return 'active';
}

/** `true` se o texto da planilha for chave EN ou rótulo PT conhecido (diferente de `parseImportedAssetStatus`, que cai em `active`). */
export function isValidImportStatusText(raw: string | undefined): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (ASSET_STATUS_KEYS.includes(lower as AssetStatus)) return true;
  const norm = t.normalize('NFC').toLowerCase();
  return Object.values(STATUS_LABELS).some(
    (label) => label.normalize('NFC').toLowerCase() === norm
  );
}

/** Linhas para CSV/PDF com coluna Status legível em português. */
export function assetsWithLocalizedStatusForExport<T extends { status: string }>(
  items: readonly T[]
): (T & { status: string })[] {
  return items.map((a) => ({
    ...a,
    status: STATUS_LABELS[a.status] ?? a.status,
  }));
}

export const fmtCurrency = (v?: number) => {
  if (v == null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
};

export const fmtDate = (s?: string) => {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('pt-BR');
  } catch {
    return s;
  }
};

export const fmtDateTime = (s?: string) => {
  if (!s) return '—';
  try {
    const d = new Date(s);
    return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return s;
  }
};

export const genId = () => 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);

/**
 * Converte mensagens genéricas de rede do navegador (ex.: "Failed to fetch") em texto útil em português.
 */
export function humanizeNetworkError(error: unknown, fallback = 'Operação não concluída.'): string {
  const msg =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const m = msg.trim().toLowerCase();
  if (
    m === 'failed to fetch' ||
    m === 'load failed' ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('err_internet_disconnected') ||
    m.includes('fetch failed')
  ) {
    return 'Não foi possível conectar ao servidor. Verifique sua internet, se o projeto Supabase está ativo no painel e se VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env estão corretos. Recarregue a página; o carregamento evita muitas requisições paralelas (menos falhas no navegador).';
  }
  return msg || fallback;
}

/** Próximo código no padrão ATI-AAAA-##### com base nos ativos já existentes (importação e cadastro). */
export function generateNextAssetCode(existingAssets: readonly { asset_code: string }[]): string {
  const year = new Date().getFullYear();
  const prefix = `ATI-${year}-`;
  let max = 0;
  const re = new RegExp(`^${prefix.replace(/-/g, '\\-')}(\\d+)$`);
  for (const a of existingAssets) {
    const m = a.asset_code.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

/** Valor seguro para CSV (objetos viram JSON curto). */
function csvCellValue(val: unknown): string {
  if (val == null) return '';
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch {
      return String(val);
    }
  }
  return String(val);
}

function triggerBlobDownload(blob: Blob, downloadName: string): boolean {
  try {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 500);
    return true;
  } catch (e) {
    console.error('Download CSV falhou:', e);
    return false;
  }
}

/** jsPDF com Helvetica não desenha bem acentos; normaliza para evitar falha silenciosa. */
function textSafeForPdf(s: string): string {
  try {
    return s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/\u2014|\u2013/g, '-');
  } catch {
    return s;
  }
}

function pdfCellValue(key: string, val: unknown): string {
  let raw: string;
  if (key.includes('date') || key.includes('_at')) {
    raw = fmtDate(val as string | undefined);
  } else if (key.includes('value') || key.includes('cost')) {
    const n =
      typeof val === 'number' && Number.isFinite(val)
        ? val
        : typeof val === 'string'
          ? parseFloat(val.replace(/\./g, '').replace(',', '.'))
          : NaN;
    raw = Number.isFinite(n) ? fmtCurrency(n) : '—';
  } else if (val == null) {
    raw = '—';
  } else if (typeof val === 'object') {
    try {
      raw = JSON.stringify(val);
    } catch {
      raw = String(val);
    }
  } else {
    raw = String(val);
  }
  return textSafeForPdf(raw);
}

/** @returns false se não houver dados ou falhar o download */
export const exportToCSV = (data: any[], filename: string, headers: Record<string, string>): boolean => {
  if (!data.length) return false;

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers);

  const csvRows: string[] = [];
  csvRows.push(headerLabels.join(';'));

  for (const row of data) {
    const values = headerKeys.map((key) => {
      const escaped = csvCellValue(row[key]).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(';'));
  }

  const csvString = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const day = new Date().toISOString().split('T')[0];
  return triggerBlobDownload(blob, `${filename}_${day}.csv`);
};

/** @returns false se não houver dados ou falhar ao gerar o PDF */
export const exportToPDF = (data: any[], filename: string, title: string, headers: Record<string, string>): boolean => {
  if (!data.length) return false;

  const headerKeys = Object.keys(headers);
  const headerLabels = Object.values(headers).map((h) => textSafeForPdf(String(h)));

  try {
    const doc = new jsPDF();
    const rows = data.map((item) => headerKeys.map((key) => pdfCellValue(key, item[key])));

    doc.setFontSize(18);
    doc.text(textSafeForPdf(title), 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${textSafeForPdf(new Date().toLocaleString('pt-BR'))}`, 14, 30);

    autoTable(doc, {
      startY: 35,
      head: [headerLabels],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241], textColor: 255 },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    const day = new Date().toISOString().split('T')[0];
    doc.save(`${filename}_${day}.pdf`);
    return true;
  } catch (e) {
    console.error('exportToPDF:', e);
    return false;
  }
};

export const downloadImportTemplate = () => {
  const headers = [
    'Código Patrimonial',
    'Descrição',
    ASSET_IMPORT_STATUS_COLUMN,
    'Categoria',
    'Centro de Custo',
    'Localização',
    'Responsável (E-mail)',
    'Valor de Aquisição',
    'Data de Aquisição (YYYY-MM-DD)',
    'Número de Série',
    'Fabricante',
    'Marca',
    'Modelo',
    'Número da Nota Fiscal',
    'Vida Útil (Meses)',
    'Observações',
  ];

  const example = [
    'PAT-001',
    'Notebook Dell Latitude',
    'Ativo',
    'Informática',
    'TI',
    'Sede São Paulo',
    'admin@aiio.com',
    '5000.00',
    '2023-01-15',
    'SN123456',
    'Dell',
    'Dell',
    'Latitude 5420',
    'NF-123',
    '36',
    'Equipamento novo',
  ];

  const csvContent = '\uFEFF' + [headers.join(';'), example.join(';')].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'modelo_importacao_ativos.csv');
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
