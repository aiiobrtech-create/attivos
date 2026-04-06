import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, Package, ArrowLeftRight, Wrench, Trash2, 
  BarChart2, ClipboardList, ShieldCheck, Settings, Users, LogOut, Menu, Bell,
  Search, Filter, FileText, FileSpreadsheet, LayoutGrid, List, Download, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  STATUS_LABELS, STATUS_COLORS, STATUS_DOTS, 
  fmtCurrency, fmtDate, fmtDateTime, genId,
  MAINT_LABELS,
  MAINT_STATUS_LABELS,
  DISPOSAL_LABELS,
  MOVEMENT_TYPE_LABELS,
  USER_ROLE_LABELS,
  exportToCSV,
  exportToPDF,
  downloadImportTemplate,
  assetsWithLocalizedStatusForExport,
  parseImportedAssetStatus,
  generateNextAssetCode,
  ASSET_IMPORT_STATUS_COLUMN,
  ASSET_IMPORT_STATUS_COLUMN_LEGACY,
  humanizeNetworkError,
} from './utils';
import { Asset, AssetStatus, Category, CostCenter, Location, User, MaintenanceOrder, Movement, Disposal, AuditLog, AssetHistory, Supplier, AppData } from './types';
import Papa from 'papaparse';
import {
  loadAppDataFromSupabase,
  seedSupabaseIfEmpty,
  syncAppDataToSupabase,
  emptyAppData,
  profileRowToUser,
} from './supabaseStore';
import { supabase, supabaseConfigured, checkSupabaseReachable } from './supabaseClient';
import { labelPayload, AssetQrPreview, AssetBarcodePreview } from './assetLabels';
import { downloadAssetCardPdf } from './assetCardPdf';
import {
  validateImportPrerequisites,
  validateAssetImportRow,
  isCsvRowEffectivelyEmpty,
  type ResolvedImportRefs,
} from './assetImportValidation';
import {
  filterAppDataByUserScope,
  filterAssetsForUserPick,
  filterCostCentersForUserPick,
  filterLocationsForUserPick,
  scopeSummaryLabel,
  validateAssetWithinUserScope,
} from './userScope';
import { invokeAdminCreateUser, invokeAdminDeleteUser, invokeAdminUpdateUserPassword } from './edgeFunctions';
import type { Session } from '@supabase/supabase-js';
import { MOCK_DATA } from './mockData';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface StoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

type ToastFn = (msg: string, type?: 's' | 'e') => void;

function exportReport(
  type: 'csv' | 'pdf',
  rows: any[],
  opts: {
    filename: string;
    pdfTitle: string;
    headers: Record<string, string>;
    emptyMessage?: string;
    successCsv?: string;
    successPdf?: string;
  },
  toastFn: ToastFn
) {
  const emptyMessage = opts.emptyMessage ?? 'Não há dados para exportar.';
  if (rows.length === 0) {
    toastFn(emptyMessage, 'e');
    return;
  }
  try {
    const ok =
      type === 'csv'
        ? exportToCSV(rows, opts.filename, opts.headers)
        : exportToPDF(rows, opts.filename, opts.pdfTitle, opts.headers);
    if (!ok) {
      toastFn('Não foi possível concluir a exportação. Permita downloads neste site.', 'e');
    } else {
      toastFn(
        type === 'csv'
          ? opts.successCsv ?? 'CSV gerado com sucesso.'
          : opts.successPdf ?? 'PDF gerado com sucesso.',
        's'
      );
    }
  } catch (e) {
    toastFn(e instanceof Error ? e.message : 'Erro ao exportar.', 'e');
  }
}

function handleStoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: StoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Erro ao persistir dados: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if ((this as any).state.hasError) {
      console.error("ErrorBoundary caught an error:", (this as any).state.error);
      let message = "Ocorreu um erro inesperado.";
      try {
        const parsed = JSON.parse((this as any).state.error?.message || '{}');
        if (parsed.error) message = `Erro ao salvar dados: ${parsed.error}`;
      } catch {
        message = (this as any).state.error?.message || message;
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-6">
          <div className="glass p-8 max-w-md w-full text-center">
            <div className="text-red-400 mb-4 text-4xl">⚠️</div>
            <h2 className="text-xl font-bold mb-2">Ops! Algo deu errado</h2>
            <p className="text-text3 text-sm mb-6">{message}</p>
            <button className="btn btn-p w-full justify-center" onClick={() => window.location.reload()}>Recarregar Aplicativo</button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

function buildSeedPayload(): AppData {
  return {
    assets: MOCK_DATA.assets.map((a) => ({ ...a })),
    categories: MOCK_DATA.categories.map((c) => ({ ...c })),
    locations: MOCK_DATA.locations.map((l) => ({ ...l })),
    costCenters: MOCK_DATA.costCenters.map((cc) => ({ ...cc })),
    users: [],
    maintenanceOrders: MOCK_DATA.maintenanceOrders.map((m) => ({ ...m })),
    movements: MOCK_DATA.movements.map((mv) => ({ ...mv })),
    disposals: MOCK_DATA.disposals.map((d) => ({ ...d })),
    suppliers: MOCK_DATA.suppliers.map((s) => ({ ...s })),
    auditLogs: MOCK_DATA.auditLogs.map((al) => ({ ...al })),
    assetHistory: MOCK_DATA.assetHistory.map((h) => ({ ...h })),
  };
}

// --- Components ---

const Badge = ({ status, type = 'asset' }: { status: string, type?: 'asset' | 'maint' }) => {
  const label = type === 'asset' ? STATUS_LABELS[status] : MAINT_STATUS_LABELS[status];
  const colorClass = type === 'asset' ? STATUS_COLORS[status] : `b-${status}`;
  const dotColor = type === 'asset' ? STATUS_DOTS[status] : undefined;

  return (
    <span className={`badge ${colorClass}`}>
      {dotColor && <span className="dot" style={{ background: dotColor }}></span>}
      {label || status}
    </span>
  );
};

const Sidebar = ({ currentRoute, onNavigate, user, onLogout }: { currentRoute: string, onNavigate: (r: string, p?: any) => void, user: any, onLogout: () => void }) => {
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: null },
    { id: 'assets', label: 'Ativos', icon: Package, section: null },
    { id: 'movements', label: 'Movimentações', icon: ArrowLeftRight, section: null },
    { id: 'maintenance', label: 'Manutenção', icon: Wrench, section: null },
    { id: 'disposals', label: 'Baixas', icon: Trash2, section: null },
    { id: 'audit', label: 'Auditoria', icon: ShieldCheck, section: null, adminOnly: true },
    { id: 'admin_sep', label: 'Administração', icon: null, section: 'Administração', adminOnly: true },
    { id: 'settings', label: 'Cadastros', icon: Settings, section: null, gestorOnly: true },
    { id: 'admin-users', label: 'Usuários', icon: Users, section: null, adminOnly: true },
  ];

  const isAdmin = user?.role === 'admin';
  const isGestor = user?.role === 'gestor_patrimonial' || isAdmin;

  return (
    <aside id="sidebar" className="flex flex-col">
      <div className="logo cursor-pointer" onClick={() => onNavigate('dashboard')}>
        <img src="/FAVICON-R.svg" alt="Logo" className="w-10 h-10 rounded-xl shadow-lg shadow-brand/20 object-contain" />
        <div>
          <div className="logo-title text-text">ATTIVOS</div>
          <div className="logo-sub">Gestão Patrimonial</div>
        </div>
      </div>
      <nav className="nav">
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && !isAdmin) return null;
          if (item.gestorOnly && !isGestor) return null;
          if (item.section) return <div key={item.id} className="nav-section">{item.label}</div>;
          const Icon = item.icon!;
          const isActive = currentRoute === item.id || currentRoute.startsWith(item.id + '-');
          return (
            <div 
              key={item.id} 
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <span className="ni"><Icon size={18} /></span>
              <span className="flex-1">{item.label}</span>
              {isActive && <span className="nav-dot"></span>}
            </div>
          );
        })}
      </nav>
      <div className="nav-footer">
        <div className="nav-item group" onClick={() => onLogout()}>
          <span className="ni group-hover:text-red-400"><LogOut size={18} /></span>
          <span className="flex-1">Sair</span>
        </div>
      </div>
    </aside>
  );
};

// --- Views ---

const ExportBar: React.FC<{
  isExporting?: 'csv' | 'pdf' | null;
  onExport: (type: 'csv' | 'pdf') => void;
  /** Rótulo para leitores de tela (cada tela pode personalizar). */
  ariaLabel?: string;
}> = ({ isExporting = null, onExport, ariaLabel = 'Exportar para Excel ou PDF' }) => (
  <div
    className="flex h-[30px] w-max max-w-full shrink-0 items-center overflow-hidden rounded-xl border border-border bg-bg4 p-0.5"
    role="group"
    aria-label={ariaLabel}
  >
    <button
      type="button"
      disabled={!!isExporting}
      onClick={() => onExport('csv')}
      className="group flex h-full w-max shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase leading-none tracking-wide text-text2 transition-colors hover:bg-bg3/80 hover:text-text disabled:opacity-50"
    >
      <FileSpreadsheet
        className="size-3 shrink-0 text-text3 transition-colors group-hover:text-green-400"
        strokeWidth={2}
        aria-hidden
      />
      <span className="truncate">{isExporting === 'csv' ? '…' : 'EXCEL'}</span>
    </button>
    <div className="mx-0.5 h-3.5 w-px shrink-0 bg-border" aria-hidden />
    <button
      type="button"
      disabled={!!isExporting}
      onClick={() => onExport('pdf')}
      className="group flex h-full w-max shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-[10px] font-bold uppercase leading-none tracking-wide text-text2 transition-colors hover:bg-bg3/80 hover:text-text disabled:opacity-50"
    >
      <FileText
        className="size-3 shrink-0 text-text3 transition-colors group-hover:text-red-400"
        strokeWidth={2}
        aria-hidden
      />
      <span className="truncate">{isExporting === 'pdf' ? '…' : 'PDF'}</span>
    </button>
  </div>
);

const Dashboard: React.FC<{ data: AppData; onNavigate: (r: string, p?: any) => void; user: User | null; onToast: ToastFn }> = ({
  data,
  onNavigate,
  user,
  onToast,
}) => {
  const [isExporting, setIsExporting] = useState<'csv' | 'pdf' | null>(null);
  const stats = [
    { label: 'Total de Ativos', value: data.assets.length, icon: Package, color: 'text-brand' },
    { label: 'Em Operação', value: data.assets.filter(a => a.status === 'active').length, icon: ShieldCheck, color: 'text-green' },
    { label: 'Em Manutenção', value: data.assets.filter(a => a.status === 'maintenance').length, icon: Wrench, color: 'text-orange' },
    { label: 'Valor Total', value: fmtCurrency(data.assets.reduce((s, a) => s + (a.acquisition_value || 0), 0)), icon: BarChart2, color: 'text-text' },
  ];

  const byStatus: Record<string, number> = {};
  data.assets.forEach(a => {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  });
  const totalVal = data.assets.reduce((s, a) => s + (a.acquisition_value || 0), 0);
  const maintCost = data.maintenanceOrders.reduce((s, m) => s + (m.cost || 0), 0);

  const handleDashboardExport = (type: 'csv' | 'pdf') => {
    setIsExporting(type);
    try {
      exportReport(
        type,
        assetsWithLocalizedStatusForExport(data.assets),
        {
          filename: 'relatorio_ativos',
          pdfTitle: 'Relatório Geral de Ativos',
          headers: {
            asset_code: 'Código',
            description: 'Descrição',
            status: 'Status',
            acquisition_date: 'Data Aquisição',
            acquisition_value: 'Valor',
          },
          emptyMessage: 'Não há ativos para exportar.',
          successCsv: 'Relatório Excel (CSV) gerado com sucesso!',
          successPdf: 'Relatório PDF gerado com sucesso!',
        },
        onToast
      );
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="ph flex flex-col items-start gap-4 lg:flex-row lg:justify-between">
        <div className="min-w-0">
          <h1 className="pt">Dashboard</h1>
          <p className="ps">Visão geral do patrimônio e indicadores principais</p>
        </div>
        <ExportBar isExporting={isExporting} onExport={handleDashboardExport} ariaLabel="Exportar relatório de ativos do dashboard" />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s, i) => (
          <div key={i} className="glass p-5 flex items-center gap-4 glass-hover">
            <div className={`w-11 h-11 rounded-xl bg-bg4 flex items-center justify-center ${s.color}`}>
              <s.icon size={22} />
            </div>
            <div>
              <div className="text-2xl font-black text-text">{s.value}</div>
              <div className="text-[11px] text-text3 uppercase font-bold tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div
        className="mb-6 grid gap-6 items-stretch [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))] [&>*]:min-w-0"
      >
        <div className="glass glass-hover flex h-full min-h-[12rem] flex-col p-6">
          <div className="sdiv !mt-0 shrink-0 break-words">Ativos por Status</div>
          <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
            {Object.entries(byStatus).map(([st, n]) => {
              const pct = data.assets.length ? Math.round((n / data.assets.length) * 100) : 0;
              return (
                <div key={st} className="group min-w-0">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <div className="min-w-0 max-w-full [&>*]:max-w-full">
                      <Badge status={st} />
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-black text-text">{n}</span>
                      <span className="ml-1 text-[11px] font-bold text-text3">({pct}%)</span>
                    </div>
                  </div>
                  <div className="bar-wrap h-2">
                    <div className="bar-fill transition-all duration-1000" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass glass-hover flex h-full min-h-[12rem] min-w-0 flex-col justify-center p-6 text-center">
          <div className="mb-2 px-0.5 text-[11px] font-black uppercase leading-snug tracking-widest text-text3 [overflow-wrap:anywhere]">
            Valor Total de Aquisição
          </div>
          <div className="px-0.5 text-2xl font-black tabular-nums tracking-tighter text-text sm:text-3xl [overflow-wrap:anywhere]">
            {fmtCurrency(totalVal)}
          </div>
        </div>

        <div className="glass glass-hover flex h-full min-h-[12rem] min-w-0 flex-col justify-center p-6 text-center">
          <div className="mb-2 px-0.5 text-[11px] font-black uppercase leading-snug tracking-widest text-text3 [overflow-wrap:anywhere]">
            Custo Total de Manutenção
          </div>
          <div className="px-0.5 text-2xl font-black tabular-nums tracking-tighter text-orange sm:text-3xl [overflow-wrap:anywhere]">
            {fmtCurrency(maintCost)}
          </div>
        </div>

        <div className="glass glass-hover flex h-full min-h-[12rem] min-w-0 flex-col p-6">
          <div className="mb-4 text-[11px] font-black uppercase leading-snug tracking-widest text-text3 [overflow-wrap:anywhere]">
            Top 3 Fornecedores (Valor)
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1 [scrollbar-gutter:stable]">
            {data.suppliers
              .map(s => ({
                name: s.name,
                total: data.assets
                  .filter(a => a.supplier_id === s.id)
                  .reduce((sum, a) => sum + (a.acquisition_value || 0), 0),
              }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 3)
              .map(s => (
                <div key={s.name} className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-[12px] font-bold leading-snug text-text line-clamp-3">
                    {s.name}
                  </div>
                  <div className="shrink-0 text-right text-[11px] font-black font-mono tabular-nums text-brand2 [overflow-wrap:anywhere]">
                    {fmtCurrency(s.total)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="glass p-5">
          <div className="hrow !mb-4">
            <div className="sdiv !mt-0">Últimas Manutenções</div>
            <button className="text-brand2 text-xs font-bold hover:underline" onClick={() => onNavigate('maintenance')}>Ver todas</button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>Ativo</th><th>Tipo</th><th>Status</th><th>Data</th></tr>
              </thead>
              <tbody>
                {data.maintenanceOrders.slice(0, 5).map(m => {
                  const a = data.assets.find(x => x.id === m.asset_id);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="text-[13px] font-bold text-text">{a?.description || '—'}</div>
                        <div className="text-[10px] font-mono text-text3">{a?.asset_code}</div>
                      </td>
                      <td className="text-[11px] font-medium">{MAINT_LABELS[m.maintenance_type]}</td>
                      <td><Badge status={m.status} type="maint" /></td>
                      <td className="text-[11px]">{fmtDate(m.opened_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const AssetDetail: React.FC<{ assetId: string, data: AppData, onNavigate: (r: string, p?: any) => void, onAction: (type: string, id: string) => void, onSaveHistory: (id: string, text: string) => void, user: User | null, onToast: (msg: string, type?: 's' | 'e') => void }> = ({ assetId, data, onNavigate, onAction, onSaveHistory, user, onToast }) => {
  const a = data.assets.find(x => x.id === assetId);
  if (!a) return <div className="empty"><div className="empty-title">Ativo não encontrado</div><button className="btn btn-p" onClick={() => onNavigate('assets')}>Voltar</button></div>;
  
  const [tab, setTab] = useState('info');
  const [cardPdfBusy, setCardPdfBusy] = useState(false);
  const [historyText, setHistoryText] = useState('');
  const cat = data.categories.find(c => c.id === a.category_id);
  const cc = data.costCenters.find(c => c.id === a.cost_center_id);
  const loc = data.locations.find(l => l.id === a.location_id);
  const resp = data.users.find(u => u.id === a.responsible_id);
  const sup = data.suppliers.find(s => s.id === a.supplier_id);
  
  const maints = data.maintenanceOrders.filter(m => m.asset_id === a.id);
  const movs = data.movements.filter(m => m.asset_id === a.id);
  const history = (data.assetHistory || []).filter(h => h.asset_id === a.id).sort((x, y) => new Date(y.date).getTime() - new Date(x.date).getTime());

  const tabs = [['info', 'Informações'], ['movements', `Movimentações (${movs.length})`], ['maintenance', `Manutenções (${maints.length})`], ['history', `Histórico (${history.length})`]];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex gap-1.5 items-center text-[12px] text-text3 mb-4">
        <button onClick={() => onNavigate('assets')} className="hover:text-text transition-colors">Ativos</button>
        <span>/</span>
        <span className="text-text font-bold">{a.asset_code}</span>
      </div>
      
      <div className="glass p-6 mb-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div className="flex gap-4 items-start">
            <div className="w-16 h-16 rounded-2xl bg-bg4 flex items-center justify-center text-3xl shrink-0 shadow-inner">📦</div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-[12px] text-brand2 font-bold tracking-tight">{a.asset_code}</span>
                {a.patrimonial_code && <span className="chip">{a.patrimonial_code}</span>}
                <Badge status={a.status} />
              </div>
              <h1 className="text-2xl font-black text-text mb-1 tracking-tight">{a.description}</h1>
              <p className="text-sm text-text3 font-medium">{[a.brand, a.model, a.manufacturer].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button
              type="button"
              className="btn btn-s"
              disabled={cardPdfBusy}
              onClick={() => {
                if (cardPdfBusy) return;
                setCardPdfBusy(true);
                void downloadAssetCardPdf({
                  asset: a,
                  categoryName: cat?.name,
                  locationName: loc?.name,
                  costCenterName: cc?.name,
                  responsibleName: resp?.name,
                  supplierLine: sup ? `${sup.name} (${sup.phone || sup.email || '—'})` : undefined,
                })
                  .then(() => onToast('PDF do cartão gerado. Verifique o download.'))
                  .catch(() => onToast('Não foi possível gerar o PDF do cartão.', 'e'))
                  .finally(() => setCardPdfBusy(false));
              }}
            >
              <Printer size={14} /> {cardPdfBusy ? 'Gerando…' : 'Cartão PDF'}
            </button>
            {user?.role !== 'viewer' && (
              <>
                <button className="btn btn-s" onClick={() => onNavigate('assets-edit', { id: a.id })}><Settings size={14} /> Editar</button>
                <button className="btn btn-p" onClick={() => onAction('move', a.id)}><ArrowLeftRight size={14} /> Movimentar</button>
                {!['disposed', 'scrapped', 'stolen'].includes(a.status) && (
                  <button className="btn btn-d" onClick={() => onAction('dispose', a.id)}><Trash2 size={14} /> Baixar</button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(([id, label]) => (
          <div key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, x: 5 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -5 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'info' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="glass p-6 lg:col-span-2">
                <div className="sdiv !mt-0">Dados do Ativo</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[
                    ['Categoria', cat?.name], ['Nº de Série', a.serial_number], ['Nota Fiscal', a.invoice_number],
                    ['Fabricante', a.manufacturer], ['Marca', a.brand], ['Modelo', a.model],
                    ['Vida Útil', a.useful_life_months ? a.useful_life_months + ' meses' : null],
                    ['Valor Aquisição', fmtCurrency(a.acquisition_value)], ['Data Compra', fmtDate(a.acquisition_date)],
                    ['Fornecedor', sup ? `${sup.name} (${sup.phone || sup.email || '—'})` : '—']
                  ].map(([l, v]) => (
                    <div key={l} className="detail-field">
                      <div className="df-label">{l}</div>
                      <div className="df-value">{v || '—'}</div>
                    </div>
                  ))}
                </div>
                {a.observations && (
                  <div className="detail-field mt-6 pt-6 border-t border-border">
                    <div className="df-label">Observações</div>
                    <div className="df-value text-[13px] text-text2 leading-relaxed">{a.observations}</div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="glass p-5">
                  <div className="sdiv !mt-0">Localização Atual</div>
                  <div className="space-y-4">
                    {[
                      ['Localização', loc?.name], ['Centro de Custo', cc?.name], ['Responsável', resp?.name]
                    ].map(([l, v]) => (
                      <div key={l} className="flex flex-col gap-1">
                        <span className="text-[11px] font-bold text-text3 uppercase tracking-wider">{l}</span>
                        <span className="text-sm text-text font-bold truncate">{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="glass p-5">
                  <div className="sdiv !mt-0">Identificação</div>
                  <div className="flex flex-col items-center gap-6 p-4">
                    <div className="flex flex-col gap-4 w-full">
                      <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-lg">
                        <AssetQrPreview value={labelPayload(a)} size={112} />
                        <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-black/40">QR Code</span>
                      </div>

                      <div className="flex flex-col items-center justify-center rounded-2xl bg-white p-4 shadow-lg">
                        <div className="w-full px-1">
                          <AssetBarcodePreview value={labelPayload(a)} />
                        </div>
                        <span className="mt-2 text-[10px] font-bold uppercase tracking-widest text-black/40">Código de Barras</span>
                      </div>
                    </div>

                    <div className="w-full pt-4 border-t border-border text-center">
                      <div className="mb-1 text-[10px] font-black uppercase tracking-widest text-text3">Código do Ativo</div>
                      <div className="font-mono text-lg font-black text-brand2">{a.asset_code}</div>
                      <p className="mt-2 text-[10px] leading-relaxed text-text3">
                        QR e código de barras foram gerados no cadastro e seguem o identificador fixo acima; não podem ser alterados.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'movements' && (
            <div className="tbl-wrap">
              {movs.length === 0 ? <div className="empty p-10"><div className="empty-title">Nenhuma movimentação</div></div> : (
                <table>
                  <thead>
                    <tr><th>Data</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Executado por</th></tr>
                  </thead>
                  <tbody>
                    {movs.map(mv => (
                      <tr key={mv.id}>
                        <td className="text-[11px] font-medium">{fmtDateTime(mv.movement_date)}</td>
                        <td><span className="chip">{MOVEMENT_TYPE_LABELS[mv.movement_type] ?? mv.movement_type}</span></td>
                        <td className="text-[12px]">{mv.from_location || mv.from_cost_center || mv.from_responsible || '—'}</td>
                        <td className="text-[12px] text-text font-bold">{mv.to_location || mv.to_cost_center || mv.to_responsible || '—'}</td>
                        <td className="text-[12px]">{mv.executor || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'maintenance' && (
            <div className="tbl-wrap">
              {maints.length === 0 ? (
                <div className="empty p-10">
                  <div className="empty-title text-text2">Nenhuma manutenção registrada</div>
                  {user?.role !== 'viewer' && (
                    <button className="btn btn-p mt-4" onClick={() => onNavigate('maintenance-new', { assetId: a.id })}>Abrir Ordem de Serviço</button>
                  )}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Ordem</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>Custo</th></tr>
                  </thead>
                  <tbody>
                    {maints.map(m => (
                      <tr key={m.id}>
                        <td className="font-mono text-[11px] text-brand2 font-bold">{m.order_number}</td>
                        <td className="text-[11px] font-medium">{MAINT_LABELS[m.maintenance_type]}</td>
                        <td><Badge status={m.status} type="maint" /></td>
                        <td className="text-[11px]">{fmtDate(m.opened_at)}</td>
                        <td className="font-mono text-[11px] font-bold text-text">{fmtCurrency(m.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'history' && (
            <div className="flex flex-col gap-4">
              {user?.role !== 'viewer' && (
                <div className="glass p-6">
                  <div className="sdiv !mt-0">Novo Registro</div>
                  <textarea 
                    className="inp mb-4 min-h-[100px]" 
                    placeholder="Descreva o evento ou observação importante..."
                    value={historyText}
                    onChange={e => setHistoryText(e.target.value)}
                  ></textarea>
                  <div className="flex justify-end">
                    <button 
                      className="btn btn-p px-6"
                      disabled={!historyText.trim()}
                      onClick={() => {
                        onSaveHistory(a.id, historyText);
                        setHistoryText('');
                      }}
                    >
                      Salvar no Histórico
                    </button>
                  </div>
                </div>
              )}
              <div className="glass p-6">
                <div className="sdiv !mt-0">Linha do Tempo</div>
                <div className="flex flex-col gap-4">
                  {history.length === 0 ? <div className="text-center py-8 text-text3 text-sm italic">Nenhum histórico registrado para este ativo.</div> : history.map(h => (
                    <div key={h.id} className="bg-bg/40 border border-border rounded-2xl p-5 glass-hover">
                      <div className="flex justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-brand/20 flex items-center justify-center text-[11px] font-black text-brand shadow-sm">{h.responsible.split(' ').map(n => n[0]).join('')}</div>
                          <span className="text-sm font-bold text-text">{h.responsible}</span>
                        </div>
                        <span className="text-[11px] text-text3 font-mono">{fmtDateTime(h.date)}</span>
                      </div>
                      <div className="text-[13px] text-text2 leading-relaxed pl-11">{h.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

const AssetForm: React.FC<{ assetId?: string, data: AppData, user: User | null, onNavigate: (r: string, p?: any) => void, onSave: (a: Asset) => void, onDelete?: (id: string) => void }> = ({ assetId, data, user, onNavigate, onSave, onDelete }) => {
  const existing = assetId ? data.assets.find(x => x.id === assetId) : null;
  const [form, setForm] = useState<Partial<Asset>>(existing || {
    asset_code: `ATI-${new Date().getFullYear()}-${String(data.assets.length + 1).padStart(5, '0')}`,
    status: 'active' as AssetStatus,
  });

  const locOptions = filterLocationsForUserPick(data.locations, user);
  const ccOptions = filterCostCentersForUserPick(data.costCenters, user);

  const labelPreviewValue = existing ? labelPayload(existing) : (form.asset_code || '').trim();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: existing?.id || genId(), ...form } as Asset);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="max-w-4xl"
    >
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Ativo' : 'Novo Ativo'}</h1>
        <p className="ps">{existing ? `Editando ${existing.asset_code}` : 'Preencha os dados do bem a ser cadastrado'}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-16">
        <div className="glass p-6">
          <div className="sdiv !mt-0">Identificação Principal</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="lbl">Código do Ativo *</label>
                  <input
                    className={`inp ${existing ? 'cursor-not-allowed bg-bg2/60 opacity-90' : ''}`}
                    required
                    readOnly={!!existing}
                    title={existing ? 'Definido no cadastro; QR e código de barras permanecem vinculados a este código.' : undefined}
                    value={form.asset_code || ''}
                    onChange={e => setForm({ ...form, asset_code: e.target.value })}
                  />
                  {existing && (
                    <p className="mt-1.5 text-[10px] font-medium text-text3">
                      Não editável: as etiquetas foram geradas com este código na inclusão do ativo.
                    </p>
                  )}
                </div>
                <div><label className="lbl">Código Patrimonial</label><input className="inp" value={form.patrimonial_code || ''} onChange={e => setForm({...form, patrimonial_code: e.target.value})} /></div>
              </div>
              <div className="mb-6">
                <label className="lbl">Descrição do Bem *</label>
                <input className="inp" required value={form.description || ''} onChange={e => setForm({...form, description: e.target.value})} placeholder="Ex: Notebook Dell Latitude 5420" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="lbl">Categoria</label>
                  <select className="inp" value={form.category_id || ''} onChange={e => setForm({...form, category_id: e.target.value})}>
                    <option value="">Selecionar...</option>
                    {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="lbl">Status Atual</label>
                  <select className="inp" value={form.status || ''} onChange={e => setForm({...form, status: e.target.value as AssetStatus})}>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-bg4/30 p-5 text-center">
                <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-text3">Prévia da Etiqueta</div>
                <div className="mb-3 rounded-xl bg-white p-3 shadow-lg">
                  <AssetQrPreview value={labelPreviewValue} size={88} />
                </div>
                <div className="w-full rounded-xl bg-white p-3 shadow-lg">
                  <AssetBarcodePreview value={labelPreviewValue} />
                </div>
                <div className="mt-3 font-mono text-[10px] font-bold text-brand2">
                  {labelPreviewValue || 'Defina o código do ativo para pré-visualizar'}
                </div>
                {!existing && (
                  <p className="mt-2 text-[9px] font-medium leading-relaxed text-text3">
                    Ao salvar, QR e código de barras serão fixados com este identificador.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="glass p-6">
          <div className="sdiv !mt-0">Especificações Técnicas</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div><label className="lbl">Fabricante</label><input className="inp" value={form.manufacturer || ''} onChange={e => setForm({...form, manufacturer: e.target.value})} /></div>
            <div><label className="lbl">Marca</label><input className="inp" value={form.brand || ''} onChange={e => setForm({...form, brand: e.target.value})} /></div>
            <div><label className="lbl">Modelo</label><input className="inp" value={form.model || ''} onChange={e => setForm({...form, model: e.target.value})} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div><label className="lbl">Número de Série</label><input className="inp" value={form.serial_number || ''} onChange={e => setForm({...form, serial_number: e.target.value})} /></div>
          </div>
        </div>

        <div className="glass p-6">
          <div className="sdiv !mt-0">Aquisição e Garantia</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="lbl">Fornecedor</label>
              <select className="inp" value={form.supplier_id || ''} onChange={e => setForm({...form, supplier_id: e.target.value})}>
                <option value="">Selecionar...</option>
                {data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div><label className="lbl">Data de Aquisição</label><input type="date" className="inp" value={form.acquisition_date || ''} onChange={e => setForm({...form, acquisition_date: e.target.value})} /></div>
            <div><label className="lbl">Valor de Aquisição (R$)</label><input type="number" step="0.01" className="inp" value={form.acquisition_value || ''} onChange={e => setForm({...form, acquisition_value: Number(e.target.value)})} placeholder="0,00" /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div><label className="lbl">Número da Nota Fiscal</label><input className="inp" value={form.invoice_number || ''} onChange={e => setForm({...form, invoice_number: e.target.value})} /></div>
            <div><label className="lbl">Data de Expiração da Garantia</label><input type="date" className="inp" value={form.warranty_expiry || ''} onChange={e => setForm({...form, warranty_expiry: e.target.value})} /></div>
          </div>
        </div>

        <div className="glass p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label className="lbl">Centro de Custo</label>
              <select className="inp" value={form.cost_center_id || ''} onChange={e => setForm({...form, cost_center_id: e.target.value})}>
                <option value="">Selecionar...</option>
                {ccOptions.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Localização</label>
              <select className="inp" value={form.location_id || ''} onChange={e => setForm({...form, location_id: e.target.value})}>
                <option value="">Selecionar...</option>
                {locOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="lbl">Responsável</label>
              <select className="inp" value={form.responsible_id || ''} onChange={e => setForm({...form, responsible_id: e.target.value})}>
                <option value="">Selecionar...</option>
                {data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mt-4">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d px-8" onClick={() => onDelete(existing.id)}>Excluir Ativo</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s px-8" onClick={() => onNavigate('assets')}>Cancelar</button>
            <button type="submit" className="btn btn-p px-8">{existing ? 'Salvar Alterações' : 'Finalizar Cadastro'}</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};


const MaintenanceView: React.FC<{
  data: AppData;
  onNavigate: (r: string, p?: any) => void;
  user: User | null;
  onDelete: (id: string) => void;
  onToast: ToastFn;
}> = ({ data, onNavigate, user, onDelete, onToast }) => {
  const [mq, setMq] = useState('');
  const [showMaintF, setShowMaintF] = useState(false);
  const [maintFStatus, setMaintFStatus] = useState('');
  const [maintFType, setMaintFType] = useState('');
  const [maintFSupplierId, setMaintFSupplierId] = useState('');
  const [maintDateFrom, setMaintDateFrom] = useState('');
  const [maintDateTo, setMaintDateTo] = useState('');

  const filteredMaint = useMemo(() => {
    let rows = data.maintenanceOrders;
    const q = mq.trim().toLowerCase();
    if (q) {
      rows = rows.filter((m) => {
        const a = data.assets.find((x) => x.id === m.asset_id);
        const s = data.suppliers.find((x) => x.id === m.supplier_id);
        return (
          m.order_number.toLowerCase().includes(q) ||
          (a?.description || '').toLowerCase().includes(q) ||
          (a?.asset_code || '').toLowerCase().includes(q) ||
          (s?.name || '').toLowerCase().includes(q) ||
          m.problem_description.toLowerCase().includes(q)
        );
      });
    }
    if (maintFStatus) rows = rows.filter((m) => m.status === maintFStatus);
    if (maintFType) rows = rows.filter((m) => m.maintenance_type === maintFType);
    if (maintFSupplierId) rows = rows.filter((m) => m.supplier_id === maintFSupplierId);
    if (maintDateFrom) {
      const t = new Date(maintDateFrom).setHours(0, 0, 0, 0);
      rows = rows.filter((m) => new Date(m.opened_at).getTime() >= t);
    }
    if (maintDateTo) {
      const t = new Date(maintDateTo).setHours(23, 59, 59, 999);
      rows = rows.filter((m) => new Date(m.opened_at).getTime() <= t);
    }
    return rows;
  }, [data.maintenanceOrders, data.assets, data.suppliers, mq, maintFStatus, maintFType, maintFSupplierId, maintDateFrom, maintDateTo]);

  const maintFiltersActive =
    !!mq.trim() || !!maintFStatus || !!maintFType || !!maintFSupplierId || !!maintDateFrom || !!maintDateTo;

  const maintenanceExportRows = (orders: MaintenanceOrder[]) =>
    orders.map((m) => ({
      ...m,
      asset_name: data.assets.find((a) => a.id === m.asset_id)?.description || '—',
      supplier_name: data.suppliers.find((s) => s.id === m.supplier_id)?.name || '—',
      m_type: MAINT_LABELS[m.maintenance_type],
      m_status: MAINT_STATUS_LABELS[m.status],
    }));

  const maintenanceHeaders = {
    order_number: 'Nº Ordem',
    asset_name: 'Ativo',
    supplier_name: 'Fornecedor',
    m_type: 'Tipo',
    m_status: 'Status',
    opened_at: 'Abertura',
    cost: 'Custo',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="hrow">
        <div>
          <h1 className="pt">Manutenção</h1>
          <p className="ps">
            {filteredMaint.length === data.maintenanceOrders.length ?
              `${data.maintenanceOrders.length} ordem(ns) registrada(s)`
            : `${filteredMaint.length} de ${data.maintenanceOrders.length} ordem(ns) (busca ou filtros)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportBar
            ariaLabel="Exportar relatório de manutenções"
            onExport={(type) => {
              const mapped = maintenanceExportRows(filteredMaint);
              const suffix = maintFiltersActive ? '_filtrado' : '';
              exportReport(
                type,
                mapped,
                {
                  filename: `manutencoes${suffix}`,
                  pdfTitle: 'Relatório de Manutenções',
                  headers: maintenanceHeaders,
                  emptyMessage: 'Não há ordens de manutenção para exportar.',
                },
                onToast
              );
            }}
          />
          {user?.role !== 'viewer' && (
            <button type="button" className="btn btn-p" onClick={() => onNavigate('maintenance-new')}>＋ Nova Ordem</button>
          )}
        </div>
      </div>

      <div className="glass mb-4 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
          <input
            className="inp w-full pl-10"
            placeholder="Buscar por ordem, ativo, fornecedor ou descrição…"
            value={mq}
            onChange={(e) => setMq(e.target.value)}
            aria-label="Buscar manutenções"
          />
        </div>
        <button
          type="button"
          className={`btn btn-s shrink-0 ${showMaintF ? 'ring-2 ring-brand2/40' : ''} ${maintFiltersActive ? 'border border-brand2/30' : ''}`}
          onClick={() => setShowMaintF((v) => !v)}
          title="Filtros por status, tipo, fornecedor e período"
        >
          <Filter size={18} className="mr-1" /> Filtros
        </button>
      </div>

      {showMaintF && (
        <div className="glass mb-6 border border-white/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text3">Filtrar ordens</span>
            {maintFiltersActive && (
              <button
                type="button"
                className="text-[11px] font-bold text-brand2 hover:underline"
                onClick={() => {
                  setMq('');
                  setMaintFStatus('');
                  setMaintFType('');
                  setMaintFSupplierId('');
                  setMaintDateFrom('');
                  setMaintDateTo('');
                }}
              >
                Limpar busca e filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="lbl text-[10px]">Status</label>
              <select className="inp" value={maintFStatus} onChange={(e) => setMaintFStatus(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(MAINT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl text-[10px]">Tipo</label>
              <select className="inp" value={maintFType} onChange={(e) => setMaintFType(e.target.value)}>
                <option value="">Todos</option>
                <option value="preventive">{MAINT_LABELS.preventive}</option>
                <option value="corrective">{MAINT_LABELS.corrective}</option>
              </select>
            </div>
            <div>
              <label className="lbl text-[10px]">Fornecedor</label>
              <select className="inp" value={maintFSupplierId} onChange={(e) => setMaintFSupplierId(e.target.value)}>
                <option value="">Todos</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl text-[10px]">Abertura de</label>
              <input type="date" className="inp" value={maintDateFrom} onChange={(e) => setMaintDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="lbl text-[10px]">Abertura até</label>
              <input type="date" className="inp" value={maintDateTo} onChange={(e) => setMaintDateTo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        {filteredMaint.length === 0 ?
          <div className="empty p-10">
            <div className="empty-title">Nenhuma ordem encontrada com os critérios atuais.</div>
          </div>
        : <table>
            <thead>
              <tr><th>Nº Ordem</th><th>Ativo</th><th>Fornecedor</th><th>Tipo</th><th>Status</th><th>Abertura</th><th>Custo</th><th className="text-right">Ações</th></tr>
            </thead>
            <tbody>
              {filteredMaint.map((m) => {
                const a = data.assets.find((x) => x.id === m.asset_id);
                const s = data.suppliers.find((x) => x.id === m.supplier_id);
                return (
                  <tr key={m.id}>
                    <td className="font-mono text-[11px] text-brand2 font-bold">{m.order_number}</td>
                    <td>
                      <div className="text-[13px] text-text font-bold truncate max-w-[200px]">{a?.description || '—'}</div>
                      <div className="text-[10px] font-mono text-text3">{a?.asset_code}</div>
                    </td>
                    <td className="text-[12px]">{s?.name || '—'}</td>
                    <td className="text-[11px] font-medium">{MAINT_LABELS[m.maintenance_type]}</td>
                    <td><Badge status={m.status} type="maint" /></td>
                    <td className="text-[11px]">{fmtDate(m.opened_at)}</td>
                    <td className="font-mono text-[11px] font-bold text-text">{fmtCurrency(m.cost)}</td>
                    <td className="text-right">
                      {user?.role !== 'viewer' && (
                        <div className="flex justify-end gap-2">
                          <button type="button" className="btn btn-s py-1 px-3 text-[10px] font-bold" onClick={() => onNavigate('maintenance-edit', { id: m.id })}>Editar</button>
                          <button type="button" className="btn btn-d py-1 px-3 text-[10px] font-bold" onClick={() => onDelete(m.id)}>Excluir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>
    </motion.div>
  );
};

const MaintenanceForm: React.FC<{ orderId?: string, assetId?: string, data: AppData, user: User | null, onNavigate: (r: string, p?: any) => void, onSave: (m: MaintenanceOrder) => void, onDelete?: (id: string) => void }> = ({ orderId, assetId, data, user, onNavigate, onSave, onDelete }) => {
  const existing = orderId ? data.maintenanceOrders.find(m => m.id === orderId) : null;
  
  const [form, setForm] = useState<Partial<MaintenanceOrder>>(existing || {
    asset_id: assetId || '',
    maintenance_type: 'preventive',
    status: 'open',
    opened_at: new Date().toISOString().slice(0, 10),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (existing) {
      onSave({ ...existing, ...form } as MaintenanceOrder);
    } else {
      const n = String(data.maintenanceOrders.length + 1).padStart(6, '0');
      onSave({ id: genId(), order_number: `MNT-${new Date().getFullYear()}-${n}`, ...form } as MaintenanceOrder);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl"
    >
      <div className="ph">
        <h1 className="pt">{existing ? `Editar Ordem ${existing.order_number}` : 'Nova Ordem de Manutenção'}</h1>
        <p className="ps">{existing ? 'Atualize os dados da manutenção' : 'Abertura de chamado técnico para ativos'}</p>
      </div>
      <form onSubmit={handleSubmit} className="glass p-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="lbl">Ativo *</label>
            <select className="inp" required value={form.asset_id || ''} onChange={e => setForm({...form, asset_id: e.target.value})} disabled={!!existing}>
              <option value="">Selecionar...</option>
              {filterAssetsForUserPick(
                data.assets.filter(a => !['disposed', 'scrapped', 'stolen'].includes(a.status) || a.id === form.asset_id),
                user,
                form.asset_id
              ).map(a => (
                <option key={a.id} value={a.id}>{a.asset_code} – {a.description.slice(0, 30)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl">Tipo de Manutenção *</label>
            <select className="inp" required value={form.maintenance_type || ''} onChange={e => setForm({...form, maintenance_type: e.target.value as any})}>
              <option value="preventive">Preventiva</option>
              <option value="corrective">Corretiva</option>
            </select>
          </div>
        </div>
        
        {existing && (
          <div className="mb-6">
            <label className="lbl">Status da Manutenção *</label>
            <select className="inp" required value={form.status || ''} onChange={e => setForm({...form, status: e.target.value as any})}>
              <option value="open">Em Aberto</option>
              <option value="in_progress">Em Andamento</option>
              <option value="completed">Concluída</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>
        )}

        <div className="mb-6">
          <label className="lbl">Descrição do Problema / Serviço *</label>
          <textarea className="inp min-h-[120px]" required value={form.problem_description || ''} onChange={e => setForm({...form, problem_description: e.target.value})} placeholder="Descreva detalhadamente o problema ou o serviço a ser realizado..."></textarea>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="lbl">Fornecedor / Oficina</label>
            <select className="inp" value={form.supplier_id || ''} onChange={e => setForm({...form, supplier_id: e.target.value})}>
              <option value="">Selecionar...</option>
              {data.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div><label className="lbl">Técnico Responsável</label><input className="inp" value={form.technician_name || ''} onChange={e => setForm({...form, technician_name: e.target.value})} placeholder="Nome do técnico" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <div><label className="lbl">Data de Abertura</label><input type="date" className="inp" value={form.opened_at || ''} onChange={e => setForm({...form, opened_at: e.target.value})} /></div>
          <div><label className="lbl">Data Agendada</label><input type="date" className="inp" value={form.scheduled_at || ''} onChange={e => setForm({...form, scheduled_at: e.target.value})} /></div>
        </div>

        {existing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
            <div><label className="lbl">Data de Conclusão</label><input type="date" className="inp" value={form.completed_at || ''} onChange={e => setForm({...form, completed_at: e.target.value})} /></div>
            <div><label className="lbl">Custo (R$)</label><input type="number" step="0.01" className="inp" value={form.cost || ''} onChange={e => setForm({...form, cost: Number(e.target.value)})} placeholder="0,00" /></div>
          </div>
        )}

        <div className="flex justify-between items-center">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d px-6" onClick={() => onDelete(existing.id)}>Excluir Ordem</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s px-6" onClick={() => onNavigate('maintenance')}>Cancelar</button>
            <button type="submit" className="btn btn-p px-10">{existing ? 'Salvar Alterações' : 'Abrir Ordem de Serviço'}</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

const MovementsView: React.FC<{
  data: AppData;
  onNavigate: (r: string, p?: any) => void;
  user: User | null;
  onDelete: (id: string) => void;
  onToast: ToastFn;
}> = ({ data, onNavigate, user, onDelete, onToast }) => {
  const [movQ, setMovQ] = useState('');
  const [showMovF, setShowMovF] = useState(false);
  const [movFType, setMovFType] = useState('');
  const [movDateFrom, setMovDateFrom] = useState('');
  const [movDateTo, setMovDateTo] = useState('');

  const filteredMovements = useMemo(() => {
    let rows = data.movements;
    const q = movQ.trim().toLowerCase();
    if (q) {
      rows = rows.filter((mv) => {
        const a = data.assets.find((x) => x.id === mv.asset_id);
        const blob = [
          a?.description,
          a?.asset_code,
          mv.reason,
          mv.executor,
          mv.from_location,
          mv.from_cost_center,
          mv.from_responsible,
          mv.to_location,
          mv.to_cost_center,
          mv.to_responsible,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (movFType) rows = rows.filter((mv) => mv.movement_type === movFType);
    if (movDateFrom) {
      const t = new Date(movDateFrom).setHours(0, 0, 0, 0);
      rows = rows.filter((mv) => new Date(mv.movement_date).getTime() >= t);
    }
    if (movDateTo) {
      const t = new Date(movDateTo).setHours(23, 59, 59, 999);
      rows = rows.filter((mv) => new Date(mv.movement_date).getTime() <= t);
    }
    return rows;
  }, [data.movements, data.assets, movQ, movFType, movDateFrom, movDateTo]);

  const movFiltersActive = !!movQ.trim() || !!movFType || !!movDateFrom || !!movDateTo;

  const movementExportRows = (movements: Movement[]) =>
    movements.map((mv) => {
      const a = data.assets.find((x) => x.id === mv.asset_id);
      return {
        movement_date: mv.movement_date,
        asset_code: a?.asset_code ?? '—',
        movement_type: MOVEMENT_TYPE_LABELS[mv.movement_type] ?? mv.movement_type,
        from_location: mv.from_location || mv.from_cost_center || mv.from_responsible || '—',
        to_location: mv.to_location || mv.to_cost_center || mv.to_responsible || '—',
        reason: mv.reason,
      };
    });

  const movementHeaders = {
    movement_date: 'Data',
    asset_code: 'Código Ativo',
    movement_type: 'Tipo',
    from_location: 'Origem',
    to_location: 'Destino',
    reason: 'Motivo',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="hrow">
        <div>
          <h1 className="pt">Movimentações</h1>
          <p className="ps">
            {filteredMovements.length === data.movements.length ?
              `${data.movements.length} registro(s) encontrado(s)`
            : `${filteredMovements.length} de ${data.movements.length} registro(s) (busca ou filtros)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportBar
            ariaLabel="Exportar relatório de movimentações"
            onExport={(type) => {
              const rows = movementExportRows(filteredMovements);
              const suffix = movFiltersActive ? '_filtrado' : '';
              exportReport(
                type,
                rows,
                {
                  filename: `movimentacoes${suffix}`,
                  pdfTitle: 'Relatório de Movimentações',
                  headers: movementHeaders,
                  emptyMessage: 'Não há movimentações para exportar.',
                },
                onToast
              );
            }}
          />
          {user?.role !== 'viewer' && (
            <button type="button" className="btn btn-p" onClick={() => onNavigate('movements-new')}>＋ Nova Movimentação</button>
          )}
        </div>
      </div>

      <div className="glass mb-4 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
          <input
            className="inp w-full pl-10"
            placeholder="Buscar por ativo, motivo, executor, origem ou destino…"
            value={movQ}
            onChange={(e) => setMovQ(e.target.value)}
            aria-label="Buscar movimentações"
          />
        </div>
        <button
          type="button"
          className={`btn btn-s shrink-0 ${showMovF ? 'ring-2 ring-brand2/40' : ''} ${movFiltersActive ? 'border border-brand2/30' : ''}`}
          onClick={() => setShowMovF((v) => !v)}
          title="Filtros por tipo e período"
        >
          <Filter size={18} className="mr-1" /> Filtros
        </button>
      </div>

      {showMovF && (
        <div className="glass mb-6 border border-white/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text3">Filtrar movimentações</span>
            {movFiltersActive && (
              <button
                type="button"
                className="text-[11px] font-bold text-brand2 hover:underline"
                onClick={() => {
                  setMovQ('');
                  setMovFType('');
                  setMovDateFrom('');
                  setMovDateTo('');
                }}
              >
                Limpar busca e filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="lbl text-[10px]">Tipo</label>
              <select className="inp" value={movFType} onChange={(e) => setMovFType(e.target.value)}>
                <option value="">Todos</option>
                <option value="transfer">{MOVEMENT_TYPE_LABELS.transfer}</option>
                <option value="loan">{MOVEMENT_TYPE_LABELS.loan}</option>
                <option value="return">{MOVEMENT_TYPE_LABELS.return}</option>
              </select>
            </div>
            <div>
              <label className="lbl text-[10px]">Data de</label>
              <input type="date" className="inp" value={movDateFrom} onChange={(e) => setMovDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="lbl text-[10px]">Data até</label>
              <input type="date" className="inp" value={movDateTo} onChange={(e) => setMovDateTo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        {filteredMovements.length === 0 ?
          <div className="empty p-10">
            <div className="empty-title">Nenhuma movimentação encontrada com os critérios atuais.</div>
          </div>
        : <table>
            <thead>
              <tr><th>Data</th><th>Ativo</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Motivo</th><th className="text-right">Ações</th></tr>
            </thead>
            <tbody>
              {filteredMovements.map((mv) => {
                const a = data.assets.find((x) => x.id === mv.asset_id);
                return (
                  <tr key={mv.id}>
                    <td className="text-[11px] font-medium">{fmtDateTime(mv.movement_date)}</td>
                    <td>
                      <div className="text-[13px] text-text font-bold truncate max-w-[160px]">{a?.description || '—'}</div>
                      <div className="text-[10px] font-mono text-text3">{a?.asset_code}</div>
                    </td>
                    <td><span className="chip">{MOVEMENT_TYPE_LABELS[mv.movement_type] ?? mv.movement_type}</span></td>
                    <td className="text-[12px]">{mv.from_location || mv.from_cost_center || mv.from_responsible || '—'}</td>
                    <td className="text-[12px] text-text font-bold">{mv.to_location || mv.to_cost_center || mv.to_responsible || '—'}</td>
                    <td className="max-w-[160px] truncate text-[11px] text-text3">{mv.reason}</td>
                    <td className="text-right">
                      {user?.role !== 'viewer' && (
                        <div className="flex justify-end gap-2">
                          <button type="button" className="btn btn-s py-1 px-3 text-[10px] font-bold" onClick={() => onNavigate('movements-edit', { id: mv.id })}>Editar</button>
                          <button type="button" className="btn btn-d py-1 px-3 text-[10px] font-bold" onClick={() => onDelete(mv.id)}>Excluir</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>
    </motion.div>
  );
};

const MovementForm: React.FC<{ movementId?: string, assetId?: string, data: AppData, onNavigate: (r: string, p?: any) => void, onSave: (m: Movement) => void, onDelete?: (id: string) => void, user: User | null }> = ({ movementId, assetId, data, onNavigate, onSave, onDelete, user }) => {
  const locPick = filterLocationsForUserPick(data.locations, user);
  const ccPick = filterCostCentersForUserPick(data.costCenters, user);
  const existing = movementId ? data.movements.find(m => m.id === movementId) : null;
  
  const [form, setForm] = useState<Partial<Movement>>(existing || {
    asset_id: assetId || '',
    movement_type: 'transfer',
    movement_date: new Date().toISOString().slice(0, 16),
    executor: user?.name || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (existing) {
      onSave({ ...existing, ...form } as Movement);
    } else {
      onSave({ id: genId(), ...form } as Movement);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="max-w-2xl"
    >
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Movimentação' : 'Nova Movimentação'}</h1>
        <p className="ps">{existing ? 'Atualize os dados do registro' : 'Registre a transferência ou empréstimo de um ativo'}</p>
      </div>
      <form onSubmit={handleSubmit} className="glass p-8">
        <div className="mb-6">
          <label className="lbl">Ativo *</label>
          <select className="inp" required value={form.asset_id || ''} onChange={e => setForm({...form, asset_id: e.target.value})} disabled={!!existing}>
            <option value="">Selecionar...</option>
            {filterAssetsForUserPick(
              data.assets.filter(a => !['disposed', 'scrapped', 'stolen'].includes(a.status) || a.id === form.asset_id),
              user,
              form.asset_id
            ).map(a => (
              <option key={a.id} value={a.id}>{a.asset_code} – {a.description.slice(0, 30)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="lbl">Tipo de Movimentação *</label>
            <select className="inp" required value={form.movement_type || ''} onChange={e => setForm({...form, movement_type: e.target.value as any})}>
              <option value="transfer">Transferência</option>
              <option value="loan">Empréstimo</option>
              <option value="return">Devolução</option>
            </select>
          </div>
          <div>
            <label className="lbl">Data e Hora *</label>
            <input type="datetime-local" className="inp" required value={form.movement_date || ''} onChange={e => setForm({...form, movement_date: e.target.value})} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="lbl">Destino (Localização)</label>
            <select className="inp" value={form.to_location} onChange={e => {
              const loc = data.locations.find(l => l.id === e.target.value);
              setForm({...form, to_location: loc?.name});
            }}>
              <option value="">Selecionar...</option>
              {locPick.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Destino (Centro de Custo)</label>
            <select className="inp" value={form.to_cost_center} onChange={e => {
              const cc = data.costCenters.find(c => c.id === e.target.value);
              setForm({...form, to_cost_center: cc?.name});
            }}>
              <option value="">Selecionar...</option>
              {ccPick.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-6">
          <label className="lbl">Novo Responsável</label>
          <select className="inp" value={form.to_responsible} onChange={e => {
            const u = data.users.find(x => x.id === e.target.value);
            setForm({...form, to_responsible: u?.name});
          }}>
            <option value="">Selecionar...</option>
            {data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>

        <div className="mb-6">
          <label className="lbl">Motivo / Observações *</label>
          <textarea className="inp min-h-[100px]" required value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} placeholder="Descreva o motivo da movimentação..."></textarea>
        </div>

        <div className="flex justify-between items-center">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d px-6" onClick={() => onDelete(existing.id)}>Excluir Registro</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s px-6" onClick={() => onNavigate('movements')}>Cancelar</button>
            <button type="submit" className="btn btn-p px-10">{existing ? 'Salvar Alterações' : 'Registrar Movimentação'}</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

const DisposalsView: React.FC<{ data: AppData; onToast: ToastFn }> = ({ data, onToast }) => {
  const [dispQ, setDispQ] = useState('');
  const [showDispF, setShowDispF] = useState(false);
  const [dispFReason, setDispFReason] = useState('');
  const [dispDateFrom, setDispDateFrom] = useState('');
  const [dispDateTo, setDispDateTo] = useState('');

  const filteredDisposals = useMemo(() => {
    let rows = data.disposals;
    const q = dispQ.trim().toLowerCase();
    if (q) {
      rows = rows.filter((d) => {
        const a = data.assets.find((x) => x.id === d.asset_id);
        const blob = [
          a?.description,
          a?.asset_code,
          d.responsible,
          d.description,
          DISPOSAL_LABELS[d.reason] || d.reason,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    if (dispFReason) rows = rows.filter((d) => d.reason === dispFReason);
    if (dispDateFrom) {
      const t = new Date(dispDateFrom).setHours(0, 0, 0, 0);
      rows = rows.filter((d) => new Date(d.disposal_date).getTime() >= t);
    }
    if (dispDateTo) {
      const t = new Date(dispDateTo).setHours(23, 59, 59, 999);
      rows = rows.filter((d) => new Date(d.disposal_date).getTime() <= t);
    }
    return rows;
  }, [data.disposals, data.assets, dispQ, dispFReason, dispDateFrom, dispDateTo]);

  const dispFiltersActive = !!dispQ.trim() || !!dispFReason || !!dispDateFrom || !!dispDateTo;

  const disposalExportRows = (list: Disposal[]) =>
    list.map((d) => {
      const a = data.assets.find((x) => x.id === d.asset_id);
      return {
        disposal_date: d.disposal_date,
        asset_code: a?.asset_code ?? '—',
        asset_description: a?.description ?? '—',
        reason: DISPOSAL_LABELS[d.reason] ?? d.reason,
        responsible: d.responsible,
        description: d.description,
      };
    });

  const disposalHeaders = {
    disposal_date: 'Data',
    asset_code: 'Código Ativo',
    asset_description: 'Descrição do Ativo',
    reason: 'Motivo',
    responsible: 'Responsável',
    description: 'Descrição',
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="hrow">
        <div>
          <h1 className="pt">Baixas</h1>
          <p className="ps">
            {filteredDisposals.length === data.disposals.length ?
              `${data.disposals.length} baixa(s) registrada(s)`
            : `${filteredDisposals.length} de ${data.disposals.length} baixa(s) (busca ou filtros)`}
          </p>
        </div>
        <ExportBar
          ariaLabel="Exportar relatório de baixas"
          onExport={(type) => {
            const rows = disposalExportRows(filteredDisposals);
            const suffix = dispFiltersActive ? '_filtrado' : '';
            exportReport(
              type,
              rows,
              {
                filename: `baixas${suffix}`,
                pdfTitle: 'Relatório de Baixas',
                headers: disposalHeaders,
                emptyMessage: 'Não há baixas para exportar.',
              },
              onToast
            );
          }}
        />
      </div>

      <div className="glass mb-4 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
          <input
            className="inp w-full pl-10"
            placeholder="Buscar por ativo, responsável, motivo ou justificativa…"
            value={dispQ}
            onChange={(e) => setDispQ(e.target.value)}
            aria-label="Buscar baixas"
          />
        </div>
        <button
          type="button"
          className={`btn btn-s shrink-0 ${showDispF ? 'ring-2 ring-brand2/40' : ''} ${dispFiltersActive ? 'border border-brand2/30' : ''}`}
          onClick={() => setShowDispF((v) => !v)}
          title="Filtros por motivo e período"
        >
          <Filter size={18} className="mr-1" /> Filtros
        </button>
      </div>

      {showDispF && (
        <div className="glass mb-6 border border-white/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text3">Filtrar baixas</span>
            {dispFiltersActive && (
              <button
                type="button"
                className="text-[11px] font-bold text-brand2 hover:underline"
                onClick={() => {
                  setDispQ('');
                  setDispFReason('');
                  setDispDateFrom('');
                  setDispDateTo('');
                }}
              >
                Limpar busca e filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="lbl text-[10px]">Motivo</label>
              <select className="inp" value={dispFReason} onChange={(e) => setDispFReason(e.target.value)}>
                <option value="">Todos</option>
                {Object.entries(DISPOSAL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl text-[10px]">Data de</label>
              <input type="date" className="inp" value={dispDateFrom} onChange={(e) => setDispDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="lbl text-[10px]">Data até</label>
              <input type="date" className="inp" value={dispDateTo} onChange={(e) => setDispDateTo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        {filteredDisposals.length === 0 ?
          <div className="empty p-10">
            <div className="empty-title">Nenhuma baixa encontrada com os critérios atuais.</div>
          </div>
        : <table>
            <thead>
              <tr><th>Ativo</th><th>Motivo</th><th>Data</th><th>Responsável</th><th>Descrição</th></tr>
            </thead>
            <tbody>
              {filteredDisposals.map((d) => {
                const a = data.assets.find((x) => x.id === d.asset_id);
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="text-[13px] text-text font-bold">{a?.description || '—'}</div>
                      <div className="text-[10px] font-mono text-text3">{a?.asset_code}</div>
                    </td>
                    <td><span className="chip">{DISPOSAL_LABELS[d.reason] || d.reason}</span></td>
                    <td className="text-[12px] font-medium">{fmtDate(d.disposal_date)}</td>
                    <td className="text-[12px]">{d.responsible}</td>
                    <td className="max-w-[200px] truncate text-[11px] text-text3">{d.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>
    </motion.div>
  );
};

const AuditView: React.FC<{ data: AppData; onToast: ToastFn }> = ({ data, onToast }) => {
  const [q, setQ] = useState('');
  const [actionF, setActionF] = useState('');
  const [entityF, setEntityF] = useState('');
  const [userF, setUserF] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const sortedLogs = useMemo(
    () =>
      [...data.auditLogs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [data.auditLogs]
  );

  const actionOptions = useMemo((): string[] => {
    const s = new Set<string>(sortedLogs.map((l) => String(l.action)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sortedLogs]);

  const entityOptions = useMemo((): string[] => {
    const s = new Set<string>(sortedLogs.map((l) => String(l.entity_type)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sortedLogs]);

  const userOptions = useMemo((): string[] => {
    const s = new Set<string>(sortedLogs.map((l) => String(l.user_email)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [sortedLogs]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return sortedLogs.filter((l) => {
      if (actionF && l.action !== actionF) return false;
      if (entityF && l.entity_type !== entityF) return false;
      if (userF && l.user_email !== userF) return false;
      if (ql) {
        const blob = `${l.action} ${l.entity_type} ${l.user_email} ${l.description}`.toLowerCase();
        if (!blob.includes(ql)) return false;
      }
      if (dateFrom) {
        const d = new Date(l.created_at).getTime();
        const from = new Date(dateFrom);
        from.setHours(0, 0, 0, 0);
        if (d < from.getTime()) return false;
      }
      if (dateTo) {
        const d = new Date(l.created_at).getTime();
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (d > to.getTime()) return false;
      }
      return true;
    });
  }, [sortedLogs, q, actionF, entityF, userF, dateFrom, dateTo]);

  const hasFilters = !!(q.trim() || actionF || entityF || userF || dateFrom || dateTo);

  const auditChipClass = (a: string) => {
    const u = a.toUpperCase();
    if (u.includes('EXCLUS') || u.includes('DELETE')) return 'bg-red/20 text-red';
    if (u.includes('CRI') || u.includes('CREATE') || u.includes('IMPORT')) return 'bg-green/20 text-green';
    return 'bg-brand/20 text-brand';
  };

  const clearFilters = () => {
    setQ('');
    setActionF('');
    setEntityF('');
    setUserF('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="ph flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="pt">Auditoria</h1>
          <p className="ps">
            {filtered.length === sortedLogs.length ?
              `${sortedLogs.length} registro(s) no log`
            : `${filtered.length} de ${sortedLogs.length} registro(s) (filtros ativos)`}
          </p>
        </div>
        <ExportBar
          ariaLabel="Exportar relatório de auditoria"
          onExport={(type) => {
            const headers = {
              created_at: 'Data/Hora',
              action: 'Ação',
              entity_type: 'Entidade',
              user_email: 'Usuário',
              description: 'Descrição',
            };
            const suffix = hasFilters ? '_filtrado' : '';
            exportReport(
              type,
              filtered,
              {
                filename: `auditoria${suffix}`,
                pdfTitle: 'Relatório de Auditoria',
                headers,
                emptyMessage: 'Não há registros de auditoria para exportar.',
              },
              onToast
            );
          }}
        />
      </div>

      <div className="glass mb-4 p-4">
        <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-text3">Filtros</div>
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
          <input
            className="inp pl-10 w-full"
            placeholder="Buscar em ação, entidade, usuário ou descrição…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Busca na auditoria"
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[140px] flex-1">
            <label className="lbl text-[10px]">Ação</label>
            <select className="inp" value={actionF} onChange={(e) => setActionF(e.target.value)}>
              <option value="">Todas</option>
              {actionOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="lbl text-[10px]">Entidade</label>
            <select className="inp" value={entityF} onChange={(e) => setEntityF(e.target.value)}>
              <option value="">Todas</option>
              {entityOptions.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px] flex-[1.2]">
            <label className="lbl text-[10px]">Usuário</label>
            <select className="inp" value={userF} onChange={(e) => setUserF(e.target.value)}>
              <option value="">Todos</option>
              {userOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="lbl text-[10px]">De</label>
            <input type="date" className="inp" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="min-w-[130px]">
            <label className="lbl text-[10px]">Até</label>
            <input type="date" className="inp" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {hasFilters && (
            <button type="button" className="btn btn-s shrink-0" onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="tbl-wrap">
        {filtered.length === 0 ?
          <div className="empty p-10">
            <div className="empty-title">
              {sortedLogs.length === 0 ? 'Nenhum registro de auditoria' : 'Nenhum resultado com os filtros atuais'}
            </div>
            {sortedLogs.length > 0 && hasFilters && (
              <button type="button" className="btn btn-s mt-4" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
          </div>
        : <table>
            <thead>
              <tr>
                <th>Data/Hora</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Usuário</th>
                <th>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="text-[11px] font-mono font-bold text-text3">{fmtDateTime(l.created_at)}</td>
                  <td>
                    <span
                      className={`chip uppercase font-black text-[9px] ${auditChipClass(l.action)}`}
                    >
                      {l.action}
                    </span>
                  </td>
                  <td>
                    <span className="chip font-bold text-[10px]">{l.entity_type}</span>
                  </td>
                  <td className="text-[12px] font-bold text-text">{l.user_email}</td>
                  <td className="text-[12px] text-text2 leading-relaxed">{l.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      </div>
    </motion.div>
  );
};

const CategoryForm: React.FC<{ categoryId?: string, data: AppData, onNavigate: (r: string, p?: any) => void, onSave: (c: Category) => void, onDelete?: (id: string) => void }> = ({ categoryId, data, onNavigate, onSave, onDelete }) => {
  const existing = categoryId ? data.categories.find(c => c.id === categoryId) : null;
  const [form, setForm] = useState({
    name: existing?.name || '',
    code: existing?.code || '',
    useful_life_months: existing?.useful_life_months || 60,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: existing?.id || genId(), ...form } as Category);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl">
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Categoria' : 'Nova Categoria'}</h1>
        <p className="ps">Gerencie as categorias de classificação dos ativos</p>
      </div>
      <form onSubmit={handleSubmit} className="glass p-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="lbl">Nome da Categoria *</label><input className="inp" required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div><label className="lbl">Código *</label><input className="inp" required value={form.code || ''} onChange={e => setForm({...form, code: e.target.value})} /></div>
        </div>
        <div><label className="lbl">Vida Útil (Meses)</label><input className="inp" type="number" value={form.useful_life_months || 0} onChange={e => setForm({...form, useful_life_months: parseInt(e.target.value)})} /></div>
        <div className="flex justify-between items-center pt-4 border-t border-border">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d" onClick={() => onDelete(existing.id)}>Excluir Categoria</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s" onClick={() => onNavigate('settings')}>Cancelar</button>
            <button type="submit" className="btn btn-p">Salvar Categoria</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

const LocationForm: React.FC<{ locationId?: string, data: AppData, onNavigate: (r: string, p?: any) => void, onSave: (l: Location) => void, onDelete?: (id: string) => void }> = ({ locationId, data, onNavigate, onSave, onDelete }) => {
  const existing = locationId ? data.locations.find(l => l.id === locationId) : null;
  const [form, setForm] = useState({
    name: existing?.name || '',
    code: existing?.code || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: existing?.id || genId(), ...form } as Location);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl">
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Localização' : 'Nova Localização'}</h1>
        <p className="ps">Defina os locais onde os ativos podem ser alocados</p>
      </div>
      <form onSubmit={handleSubmit} className="glass p-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="lbl">Nome do Local *</label><input className="inp" required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div><label className="lbl">Código *</label><input className="inp" required value={form.code || ''} onChange={e => setForm({...form, code: e.target.value})} /></div>
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-border">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d" onClick={() => onDelete(existing.id)}>Excluir Localização</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s" onClick={() => onNavigate('settings')}>Cancelar</button>
            <button type="submit" className="btn btn-p">Salvar Localização</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

const CostCenterForm: React.FC<{ costCenterId?: string, data: AppData, onNavigate: (r: string, p?: any) => void, onSave: (cc: CostCenter) => void, onDelete?: (id: string) => void }> = ({ costCenterId, data, onNavigate, onSave, onDelete }) => {
  const existing = costCenterId ? data.costCenters.find(c => c.id === costCenterId) : null;
  const [form, setForm] = useState({
    name: existing?.name || '',
    code: existing?.code || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: existing?.id || genId(), ...form } as CostCenter);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl">
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}</h1>
        <p className="ps">Gerencie as unidades de custo da organização</p>
      </div>
      <form onSubmit={handleSubmit} className="glass p-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="lbl">Nome *</label><input className="inp" required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div><label className="lbl">Código *</label><input className="inp" required value={form.code || ''} onChange={e => setForm({...form, code: e.target.value})} /></div>
        </div>
        <div className="flex justify-between items-center pt-4 border-t border-border">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d" onClick={() => onDelete(existing.id)}>Excluir Centro de Custo</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s" onClick={() => onNavigate('settings')}>Cancelar</button>
            <button type="submit" className="btn btn-p">Salvar Centro de Custo</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

const UserForm: React.FC<{ userId?: string, data: AppData, onNavigate: (r: string, p?: any) => void, onSave: (u: User) => void, onDelete?: (id: string) => void }> = ({ userId, data, onNavigate, onSave, onDelete }) => {
  const existing = userId ? data.users.find(u => u.id === userId) : null;
  const [form, setForm] = useState({
    name: existing?.name || '',
    email: existing?.email || '',
    password: '',
    role: existing?.role || 'operador',
    allowed_location_ids: [...(existing?.allowed_location_ids ?? [])],
    allowed_cost_center_ids: [...(existing?.allowed_cost_center_ids ?? [])],
  });

  const locationsSorted = useMemo(
    () => [...data.locations].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [data.locations]
  );
  const costCentersSorted = useMemo(
    () => [...data.costCenters].sort((a, b) => `${a.code} ${a.name}`.localeCompare(`${b.code} ${b.name}`, 'pt-BR')),
    [data.costCenters]
  );

  useEffect(() => {
    setForm((prev) => {
      let nextLoc = prev.allowed_location_ids;
      let nextCc = prev.allowed_cost_center_ids;
      if (data.locations.length > 0) {
        const allowed = new Set(data.locations.map((l) => l.id));
        nextLoc = prev.allowed_location_ids.filter((id) => allowed.has(id));
      }
      if (data.costCenters.length > 0) {
        const allowed = new Set(data.costCenters.map((c) => c.id));
        nextCc = prev.allowed_cost_center_ids.filter((id) => allowed.has(id));
      }
      if (nextLoc.length === prev.allowed_location_ids.length && nextCc.length === prev.allowed_cost_center_ids.length) {
        return prev;
      }
      return { ...prev, allowed_location_ids: nextLoc, allowed_cost_center_ids: nextCc };
    });
  }, [data.locations, data.costCenters]);

  const toggleId = (field: 'allowed_location_ids' | 'allowed_cost_center_ids', id: string) => {
    setForm((prev) => {
      const set = new Set(prev[field]);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...prev, [field]: [...set] };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: existing?.id || genId(),
      name: form.name,
      email: form.email,
      password: form.password,
      role: form.role,
      allowed_location_ids: form.allowed_location_ids,
      allowed_cost_center_ids: form.allowed_cost_center_ids,
    } as User);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl">
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Usuário' : 'Novo Usuário'}</h1>
        <p className="ps">Autenticação via Supabase Auth. Novo usuário recebe e-mail de confirmação se estiver habilitado no projeto.</p>
      </div>
      <form onSubmit={handleSubmit} className="glass p-6 flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4">
          <div><label className="lbl">Nome Completo *</label><input className="inp" required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} /></div>
          <div><label className="lbl">E-mail *</label><input className="inp" type="email" required readOnly={!!existing} value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="lbl">{existing ? 'Nova senha (opcional)' : 'Senha *'}</label>
            <input
              className="inp"
              type="password"
              autoComplete="new-password"
              required={!existing}
              value={form.password || ''}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
            {existing && <p className="text-[10px] text-text3 mt-1">Deixe em branco para manter a senha atual.</p>}
          </div>
          <div>
            <label className="lbl">Função / Perfil</label>
            <select className="inp" value={form.role || ''} onChange={e => setForm({...form, role: e.target.value})}>
              <option value="admin">Administrador</option>
              <option value="gestor_patrimonial">Gestor patrimonial</option>
              <option value="operador">Operador</option>
              <option value="auditor">Auditor</option>
              <option value="viewer">Visualizador</option>
            </select>
          </div>
        </div>

        <div className={`rounded-2xl border border-border bg-bg4/20 p-5 ${form.role === 'admin' ? 'opacity-60' : ''}`}>
          <div className="sdiv !mt-0">Escopo de visualização do patrimônio</div>
          <p className="mb-4 text-[11px] leading-relaxed text-text3">
            Opcional. <span className="font-semibold text-text2">Administradores</span> veem sempre todo o patrimônio (marcações abaixo são ignoradas e zeradas ao salvar).
            Para os demais perfis: sem marcação em um grupo = sem filtro naquele eixo. Com os dois grupos preenchidos, o ativo precisa estar em <span className="font-bold text-text2">uma localização permitida e em um centro de custo permitido</span>.
          </p>
          <p className="mb-3 flex flex-wrap items-center gap-x-2 text-[11px] leading-relaxed text-text2">
            <span>
              As listas vêm direto dos cadastros em <span className="font-semibold text-text">Configurações</span> (aba Localizações e Centros de custo). Ao incluir ou excluir itens lá, esta tela passa a refletir o catálogo atual.
            </span>
            <button type="button" className="font-bold text-brand2 hover:underline" onClick={() => onNavigate('settings')}>
              Abrir Configurações
            </button>
          </p>
          {form.role === 'admin' && (
            <p className="mb-3 text-[11px] font-bold text-brand2">Perfil Administrador: escopo não se aplica.</p>
          )}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-text3">Localizações cadastradas</span>
                <button
                  type="button"
                  className="text-[10px] font-bold text-brand2 hover:underline disabled:opacity-40"
                  disabled={form.role === 'admin'}
                  onClick={() => setForm((f) => ({ ...f, allowed_location_ids: [] }))}
                >
                  Limpar
                </button>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border bg-bg3/40 p-3">
                {locationsSorted.length === 0 ? (
                  <span className="text-[11px] text-text3">Nenhuma localização cadastrada em Configurações.</span>
                ) : (
                  locationsSorted.map((l) => (
                    <label key={l.id} className={`flex items-center gap-2 text-[12px] text-text ${form.role === 'admin' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        disabled={form.role === 'admin'}
                        checked={form.allowed_location_ids.includes(l.id)}
                        onChange={() => toggleId('allowed_location_ids', l.id)}
                      />
                      <span className="truncate">
                        {l.code} – {l.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-text3">Centros de custo cadastrados</span>
                <button
                  type="button"
                  className="text-[10px] font-bold text-brand2 hover:underline disabled:opacity-40"
                  disabled={form.role === 'admin'}
                  onClick={() => setForm((f) => ({ ...f, allowed_cost_center_ids: [] }))}
                >
                  Limpar
                </button>
              </div>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border bg-bg3/40 p-3">
                {costCentersSorted.length === 0 ? (
                  <span className="text-[11px] text-text3">Nenhum centro de custo cadastrado em Configurações.</span>
                ) : (
                  costCentersSorted.map((c) => (
                    <label key={c.id} className={`flex items-center gap-2 text-[12px] text-text ${form.role === 'admin' ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        disabled={form.role === 'admin'}
                        checked={form.allowed_cost_center_ids.includes(c.id)}
                        onChange={() => toggleId('allowed_cost_center_ids', c.id)}
                      />
                      <span className="truncate">
                        {c.code} – {c.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-border">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d" onClick={() => onDelete(existing.id)}>Excluir Usuário</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s" onClick={() => onNavigate('admin-users')}>Cancelar</button>
            <button type="submit" className="btn btn-p">Salvar Usuário</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

const SettingsView: React.FC<{
  data: AppData;
  onNavigate: (r: string, p?: any) => void;
  user: User | null;
  onToast: ToastFn;
}> = ({ data, onNavigate, user, onToast }) => {
  const [tab, setTab] = useState('cats');
  const [setSearch, setSetSearch] = useState('');
  const [showSetF, setShowSetF] = useState(false);
  const [setSupType, setSetSupType] = useState<'PF' | 'PJ' | ''>('');
  const isViewer = user?.role === 'viewer';

  useEffect(() => {
    if (tab !== 'sups') setShowSetF(false);
  }, [tab]);

  const filteredCategories = useMemo(() => {
    const ql = setSearch.trim().toLowerCase();
    if (!ql) return data.categories;
    return data.categories.filter(
      (c) => c.name.toLowerCase().includes(ql) || c.code.toLowerCase().includes(ql)
    );
  }, [data.categories, setSearch]);

  const filteredLocations = useMemo(() => {
    const ql = setSearch.trim().toLowerCase();
    if (!ql) return data.locations;
    return data.locations.filter(
      (l) => l.name.toLowerCase().includes(ql) || l.code.toLowerCase().includes(ql)
    );
  }, [data.locations, setSearch]);

  const filteredCostCenters = useMemo(() => {
    const ql = setSearch.trim().toLowerCase();
    if (!ql) return data.costCenters;
    return data.costCenters.filter(
      (cc) => cc.name.toLowerCase().includes(ql) || cc.code.toLowerCase().includes(ql)
    );
  }, [data.costCenters, setSearch]);

  const filteredSuppliers = useMemo(() => {
    let s = data.suppliers;
    if (setSupType) s = s.filter((x) => x.type === setSupType);
    const ql = setSearch.trim().toLowerCase();
    if (!ql) return s;
    return s.filter((x) => {
      const blob = [
        x.name,
        x.trade_name,
        x.cnpj,
        x.cpf,
        x.email,
        x.phone,
        x.contact_person,
        x.address?.city,
        x.address?.state,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return blob.includes(ql);
    });
  }, [data.suppliers, setSearch, setSupType]);

  const setFiltersActive =
    !!setSearch.trim() || (tab === 'sups' && !!setSupType);

  const settingsExportSuffix = setFiltersActive ? '_filtrado' : '';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="ph flex flex-col items-start gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="pt">Configurações</h1>
          <p className="ps">Gestão de tabelas auxiliares e cadastros base</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportBar
            ariaLabel="Exportar cadastros da aba de configurações"
            onExport={(type) => {
              if (tab === 'cats') {
                const h = { name: 'Nome', code: 'Código', useful_life_months: 'Vida Útil' };
                exportReport(
                  type,
                  filteredCategories,
                  {
                    filename: `categorias${settingsExportSuffix}`,
                    pdfTitle: 'Relatório de Categorias',
                    headers: h,
                    emptyMessage: 'Não há categorias para exportar.',
                  },
                  onToast
                );
              } else if (tab === 'locs') {
                const h = { name: 'Nome', code: 'Código' };
                exportReport(
                  type,
                  filteredLocations,
                  {
                    filename: `localizacoes${settingsExportSuffix}`,
                    pdfTitle: 'Relatório de Localizações',
                    headers: h,
                    emptyMessage: 'Não há localizações para exportar.',
                  },
                  onToast
                );
              } else if (tab === 'ccs') {
                const h = { name: 'Nome', code: 'Código' };
                exportReport(
                  type,
                  filteredCostCenters,
                  {
                    filename: `centros_custo${settingsExportSuffix}`,
                    pdfTitle: 'Relatório de Centros de Custo',
                    headers: h,
                    emptyMessage: 'Não há centros de custo para exportar.',
                  },
                  onToast
                );
              } else {
                const h = { name: 'Nome', type: 'Tipo', cnpj: 'CNPJ', cpf: 'CPF', email: 'Email', phone: 'Telefone' };
                exportReport(
                  type,
                  filteredSuppliers,
                  {
                    filename: `fornecedores${settingsExportSuffix}`,
                    pdfTitle: 'Relatório de Fornecedores',
                    headers: h,
                    emptyMessage: 'Não há fornecedores para exportar.',
                  },
                  onToast
                );
              }
            }}
          />
          {!isViewer && (
            <>
              {tab === 'cats' && <button className="btn btn-p" onClick={() => onNavigate('settings-category-edit')}>＋ Nova Categoria</button>}
              {tab === 'locs' && <button className="btn btn-p" onClick={() => onNavigate('settings-location-edit')}>＋ Nova Localização</button>}
              {tab === 'ccs' && <button className="btn btn-p" onClick={() => onNavigate('settings-costcenter-edit')}>＋ Novo Centro de Custo</button>}
              {tab === 'sups' && <button className="btn btn-p" onClick={() => onNavigate('settings-supplier-edit')}>＋ Novo Fornecedor</button>}
            </>
          )}
        </div>
      </div>
      <div className="tabs mb-4">
        <div className={`tab ${tab === 'cats' ? 'active' : ''}`} onClick={() => setTab('cats')}>Categorias</div>
        <div className={`tab ${tab === 'locs' ? 'active' : ''}`} onClick={() => setTab('locs')}>Localizações</div>
        <div className={`tab ${tab === 'ccs' ? 'active' : ''}`} onClick={() => setTab('ccs')}>Centros de Custo</div>
        <div className={`tab ${tab === 'sups' ? 'active' : ''}`} onClick={() => setTab('sups')}>Fornecedores</div>
      </div>

      <div className="glass mb-4 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
          <input
            className="inp w-full pl-10"
            placeholder={
              tab === 'sups' ?
                'Buscar fornecedor, CNPJ, CPF, e-mail, cidade…'
              : 'Buscar por nome ou código…'
            }
            value={setSearch}
            onChange={(e) => setSetSearch(e.target.value)}
            aria-label="Buscar cadastros"
          />
        </div>
        {tab === 'sups' && (
          <button
            type="button"
            className={`btn btn-s shrink-0 ${showSetF ? 'ring-2 ring-brand2/40' : ''} ${setFiltersActive ? 'border border-brand2/30' : ''}`}
            onClick={() => setShowSetF((v) => !v)}
            title="Filtrar fornecedores por tipo de pessoa (PF ou PJ)"
          >
            <Filter size={18} className="mr-1" /> Filtros
          </button>
        )}
      </div>

      {showSetF && tab === 'sups' && (
        <div className="glass mb-4 border border-white/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text3">Filtros — fornecedores</span>
            {setFiltersActive && (
              <button
                type="button"
                className="text-[11px] font-bold text-brand2 hover:underline"
                onClick={() => {
                  setSetSearch('');
                  setSetSupType('');
                }}
              >
                Limpar busca e filtros
              </button>
            )}
          </div>
          <div className="max-w-xs">
            <label className="lbl text-[10px]">Tipo de pessoa</label>
            <select className="inp" value={setSupType} onChange={(e) => setSetSupType(e.target.value as 'PF' | 'PJ' | '')}>
              <option value="">Todos</option>
              <option value="PJ">Pessoa jurídica (PJ)</option>
              <option value="PF">Pessoa física (PF)</option>
            </select>
          </div>
        </div>
      )}

      <div className="glass p-2">
        {tab === 'cats' && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Nome da Categoria</th><th>Código</th><th>Vida Útil (Meses)</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {filteredCategories.length === 0 ?
                  <tr><td colSpan={4} className="py-10 text-center text-sm text-text3">Nenhuma categoria encontrada.</td></tr>
                : filteredCategories.map((c) => (
                  <tr key={c.id}>
                    <td className="font-bold text-text">{c.name}</td>
                    <td><span className="chip font-mono font-bold">{c.code}</span></td>
                    <td className="font-medium">{c.useful_life_months} meses</td>
                    <td className="text-right">
                      {!isViewer && (
                        <button className="btn btn-s py-1 px-3 text-[10px] font-bold" onClick={() => onNavigate('settings-category-edit', { id: c.id })}>Editar</button>
                      )}
                    </td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        )}
        {tab === 'locs' && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Nome da Localização</th><th>Código</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {filteredLocations.length === 0 ?
                  <tr><td colSpan={3} className="py-10 text-center text-sm text-text3">Nenhuma localização encontrada.</td></tr>
                : filteredLocations.map((l) => (
                  <tr key={l.id}>
                    <td className="font-bold text-text">{l.name}</td>
                    <td><span className="chip font-mono font-bold">{l.code}</span></td>
                    <td className="text-right">
                      {!isViewer && (
                        <button className="btn btn-s py-1 px-3 text-[10px] font-bold" onClick={() => onNavigate('settings-location-edit', { id: l.id })}>Editar</button>
                      )}
                    </td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        )}
        {tab === 'ccs' && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Centro de Custo</th><th>Código</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {filteredCostCenters.length === 0 ?
                  <tr><td colSpan={3} className="py-10 text-center text-sm text-text3">Nenhum centro de custo encontrado.</td></tr>
                : filteredCostCenters.map((cc) => (
                  <tr key={cc.id}>
                    <td className="font-bold text-text">{cc.name}</td>
                    <td><span className="chip font-mono font-bold">{cc.code}</span></td>
                    <td className="text-right">
                      {!isViewer && (
                        <button className="btn btn-s py-1 px-3 text-[10px] font-bold" onClick={() => onNavigate('settings-costcenter-edit', { id: cc.id })}>Editar</button>
                      )}
                    </td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        )}
        {tab === 'sups' && (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Fornecedor</th><th>Documento</th><th>Contato</th><th>Cidade/UF</th><th className="text-right">Ações</th></tr></thead>
              <tbody>
                {filteredSuppliers.length === 0 ?
                  <tr><td colSpan={5} className="py-10 text-center text-sm text-text3">Nenhum fornecedor encontrado.</td></tr>
                : filteredSuppliers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-text">{s.name}</div>
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${s.type === 'PF' ? 'bg-orange/10 text-orange' : 'bg-brand/10 text-brand'}`}>{s.type || 'PJ'}</span>
                      </div>
                      <div className="text-[10px] text-text3">{s.trade_name}</div>
                    </td>
                    <td className="font-mono text-[11px]">{s.type === 'PF' ? s.cpf : s.cnpj || '—'}</td>
                    <td>
                      <div className="text-[12px]">{s.contact_person || '—'}</div>
                      <div className="text-[10px] text-text3">{s.phone}</div>
                    </td>
                    <td className="text-[12px]">{s.address?.city ? `${s.address.city}/${s.address.state}` : '—'}</td>
                    <td className="text-right">
                      {!isViewer && (
                        <button className="btn btn-s py-1 px-3 text-[10px] font-bold" onClick={() => onNavigate('settings-supplier-edit', { id: s.id })}>Editar</button>
                      )}
                    </td>
                  </tr>
                ))
                }
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};

const AdminUsersView: React.FC<{
  data: AppData;
  user: User | null;
  onNavigate: (r: string, p?: any) => void;
  onDeleteUser: (id: string) => void | Promise<void>;
  onToast: ToastFn;
}> = ({ data, user, onNavigate, onDeleteUser, onToast }) => {
  const [uq, setUq] = useState('');
  const [showUserF, setShowUserF] = useState(false);
  const [userRoleFilter, setUserRoleFilter] = useState('');

  const filteredUsers = useMemo(() => {
    const ql = uq.trim().toLowerCase();
    let rows = data.users;
    if (userRoleFilter) rows = rows.filter((u) => u.role === userRoleFilter);
    if (!ql) return rows;
    return rows.filter(
      (u) =>
        u.name.toLowerCase().includes(ql) ||
        u.email.toLowerCase().includes(ql) ||
        (USER_ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(ql)
    );
  }, [data.users, uq, userRoleFilter]);

  const userFiltersActive = !!uq.trim() || !!userRoleFilter;
  const userExportSuffix = userFiltersActive ? '_filtrado' : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      <div className="hrow">
        <div>
          <h1 className="pt">Usuários</h1>
          <p className="ps">
            {filteredUsers.length === data.users.length ?
              `${data.users.length} usuário(s) cadastrado(s)`
            : `${filteredUsers.length} de ${data.users.length} usuário(s) (busca ou filtros)`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportBar
            ariaLabel="Exportar lista de usuários"
            onExport={(type) => {
              const rows = filteredUsers.map((u) => ({
                ...u,
                role: USER_ROLE_LABELS[u.role] ?? u.role,
                escopo: scopeSummaryLabel(u),
              }));
              const h = { name: 'Nome', email: 'Email', role: 'Função', escopo: 'Escopo (loc./CC)' };
              exportReport(
                type,
                rows,
                {
                  filename: `usuarios${userExportSuffix}`,
                  pdfTitle: 'Relatório de Usuários',
                  headers: h,
                  emptyMessage: 'Não há usuários para exportar.',
                },
                onToast
              );
            }}
          />
          {user?.role === 'admin' && (
            <button type="button" className="btn btn-p" onClick={() => onNavigate('admin-user-new')}>
              ＋ Novo Usuário
            </button>
          )}
        </div>
      </div>

      <div className="glass mb-4 flex flex-wrap gap-3 p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
          <input
            className="inp w-full pl-10"
            placeholder="Buscar por nome, e-mail ou função…"
            value={uq}
            onChange={(e) => setUq(e.target.value)}
            aria-label="Buscar usuários"
          />
        </div>
        <button
          type="button"
          className={`btn btn-s shrink-0 ${showUserF ? 'ring-2 ring-brand2/40' : ''} ${userFiltersActive ? 'border border-brand2/30' : ''}`}
          onClick={() => setShowUserF((v) => !v)}
          title="Filtrar por função no sistema"
        >
          <Filter size={18} className="mr-1" /> Filtros
        </button>
      </div>

      {showUserF && (
        <div className="glass mb-4 border border-white/10 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text3">Filtros</span>
            {userFiltersActive && (
              <button
                type="button"
                className="text-[11px] font-bold text-brand2 hover:underline"
                onClick={() => {
                  setUq('');
                  setUserRoleFilter('');
                }}
              >
                Limpar busca e filtros
              </button>
            )}
          </div>
          <div className="max-w-xs">
            <label className="lbl text-[10px]">Função</label>
            <select
              className="inp"
              value={userRoleFilter}
              onChange={(e) => setUserRoleFilter(e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(USER_ROLE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Email</th>
              <th>Função</th>
              <th>Escopo</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ?
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-text3">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            : filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand/10 text-[11px] font-black text-brand">
                        {u.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <span className="text-sm font-bold text-text">{u.name}</span>
                    </div>
                  </td>
                  <td className="text-[12px] font-medium text-text3">{u.email}</td>
                  <td>
                    <span className="chip text-[10px] font-bold">{USER_ROLE_LABELS[u.role] ?? u.role}</span>
                  </td>
                  <td className="max-w-[140px] text-[10px] font-medium leading-snug text-text3">
                    {u.role === 'admin' ?
                      <span className="italic text-text3">—</span>
                    : scopeSummaryLabel(u)}
                  </td>
                  <td>
                    <span className="badge b-active">Ativo</span>
                  </td>
                  <td className="text-right">
                    {user?.role === 'admin' ?
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-s px-3 py-1 text-[10px] font-bold"
                          onClick={() => onNavigate('admin-user-edit', { id: u.id })}
                        >
                          Editar / Senha
                        </button>
                        <button
                          type="button"
                          className="btn btn-d px-3 py-1 text-[10px] font-bold"
                          onClick={() => onDeleteUser(u.id)}
                        >
                          Excluir
                        </button>
                      </div>
                    : <span className="text-[10px] italic text-text3">Somente leitura</span>}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};

const SupplierForm: React.FC<{ supplierId?: string, data: AppData, onNavigate: (r: string, p?: any) => void, onSave: (s: Supplier) => void, onDelete?: (id: string) => void }> = ({ supplierId, data, onNavigate, onSave, onDelete }) => {
  const existing = supplierId ? data.suppliers.find(x => x.id === supplierId) : null;
  const [form, setForm] = useState<Partial<Supplier>>(existing || {
    type: 'PJ',
    address: {}
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: existing?.id || genId(), ...form } as Supplier);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="max-w-4xl"
    >
      <div className="ph">
        <h1 className="pt">{existing ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h1>
        <p className="ps">{existing ? `Editando ${existing.name}` : 'Preencha os dados cadastrais do fornecedor'}</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-16">
        <div className="glass p-6">
          <div className="sdiv !mt-0">Dados Cadastrais</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div className="sm:col-span-2">
              <label className="lbl">Tipo de Pessoa *</label>
              <div className="flex gap-4 mt-2">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    className="w-4 h-4 accent-brand" 
                    checked={form.type === 'PJ'} 
                    onChange={() => setForm({...form, type: 'PJ', cpf: undefined, rg: undefined})} 
                  />
                  <span className={`text-sm font-bold ${form.type === 'PJ' ? 'text-brand' : 'text-text3'}`}>Pessoa Jurídica</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input 
                    type="radio" 
                    className="w-4 h-4 accent-brand" 
                    checked={form.type === 'PF'} 
                    onChange={() => setForm({...form, type: 'PF', cnpj: undefined, trade_name: undefined, state_registration: undefined})} 
                  />
                  <span className={`text-sm font-bold ${form.type === 'PF' ? 'text-brand' : 'text-text3'}`}>Pessoa Física</span>
                </label>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="lbl">{form.type === 'PJ' ? 'Razão Social *' : 'Nome Completo *'}</label>
              <input className="inp" required value={form.name || ''} onChange={e => setForm({...form, name: e.target.value})} />
            </div>

            {form.type === 'PJ' ? (
              <>
                <div>
                  <label className="lbl">Nome Fantasia</label>
                  <input className="inp" value={form.trade_name || ''} onChange={e => setForm({...form, trade_name: e.target.value})} />
                </div>
                <div>
                  <label className="lbl">CNPJ</label>
                  <input className="inp" value={form.cnpj || ''} onChange={e => setForm({...form, cnpj: e.target.value})} placeholder="00.000.000/0000-00" />
                </div>
                <div>
                  <label className="lbl">Inscrição Estadual</label>
                  <input className="inp" value={form.state_registration || ''} onChange={e => setForm({...form, state_registration: e.target.value})} />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="lbl">CPF</label>
                  <input className="inp" value={form.cpf || ''} onChange={e => setForm({...form, cpf: e.target.value})} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="lbl">RG</label>
                  <input className="inp" value={form.rg || ''} onChange={e => setForm({...form, rg: e.target.value})} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="glass p-6">
          <div className="sdiv !mt-0">Contato</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <label className="lbl">Pessoa de Contato</label>
              <input className="inp" value={form.contact_person || ''} onChange={e => setForm({...form, contact_person: e.target.value})} />
            </div>
            <div>
              <label className="lbl">E-mail</label>
              <input className="inp" type="email" value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
            </div>
            <div>
              <label className="lbl">Telefone</label>
              <input className="inp" value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} />
            </div>
          </div>
        </div>

        <div className="glass p-6">
          <div className="sdiv !mt-0">Endereço</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-6 mb-6">
            <div className="sm:col-span-3">
              <label className="lbl">Logradouro</label>
              <input className="inp" value={form.address?.street || ''} onChange={e => setForm({...form, address: {...form.address, street: e.target.value}})} />
            </div>
            <div>
              <label className="lbl">Número</label>
              <input className="inp" value={form.address?.number || ''} onChange={e => setForm({...form, address: {...form.address, number: e.target.value}})} />
            </div>
            <div className="sm:col-span-2">
              <label className="lbl">Complemento</label>
              <input className="inp" value={form.address?.complement || ''} onChange={e => setForm({...form, address: {...form.address, complement: e.target.value}})} />
            </div>
            <div className="sm:col-span-2">
              <label className="lbl">Bairro</label>
              <input className="inp" value={form.address?.neighborhood || ''} onChange={e => setForm({...form, address: {...form.address, neighborhood: e.target.value}})} />
            </div>
            <div className="sm:col-span-2">
              <label className="lbl">Cidade</label>
              <input className="inp" value={form.address?.city || ''} onChange={e => setForm({...form, address: {...form.address, city: e.target.value}})} />
            </div>
            <div>
              <label className="lbl">UF</label>
              <input className="inp" maxLength={2} value={form.address?.state || ''} onChange={e => setForm({...form, address: {...form.address, state: e.target.value.toUpperCase()}})} />
            </div>
            <div>
              <label className="lbl">CEP</label>
              <input className="inp" value={form.address?.zip_code || ''} onChange={e => setForm({...form, address: {...form.address, zip_code: e.target.value}})} />
            </div>
          </div>
        </div>

        <div className="glass p-6">
          <div className="sdiv !mt-0">Observações</div>
          <textarea className="inp min-h-[100px]" value={form.observations} onChange={e => setForm({...form, observations: e.target.value})}></textarea>
        </div>

        <div className="flex justify-between items-center">
          <div>
            {existing && onDelete && (
              <button type="button" className="btn btn-d px-8" onClick={() => onDelete(existing.id)}>Excluir Fornecedor</button>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn btn-s px-8" onClick={() => onNavigate('settings')}>Cancelar</button>
            <button type="submit" className="btn btn-p px-12">Salvar Fornecedor</button>
          </div>
        </div>
      </form>
    </motion.div>
  );
};

// --- Main App Component ---

export default function App() {
  const [currentRoute, setCurrentRoute] = useState('dashboard');
  const [routeParams, setRouteParams] = useState<any>({});
  const [data, setData] = useState<AppData>(() => emptyAppData());
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  /** Diagnóstico na tela de login: host Supabase alcançável? */
  const [supabaseReach, setSupabaseReach] = useState<
    null | 'checking' | 'ok' | 'misconfigured' | 'unreachable'
  >(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [loginForm, setLoginForm] = useState({ email: '', pass: '', displayName: '' });
  const [user, setUser] = useState<User | null>(null);
  const [modal, setModal] = useState<{ type: string, assetId: string } | null>(null);
  const [modalForm, setModalForm] = useState<any>({});
  const [toasts, setToasts] = useState<{ id: string, msg: string, type: 's' | 'e' }[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [assetViewMode, setAssetViewMode] = useState<'table' | 'cards'>('table');
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [showAssetFilters, setShowAssetFilters] = useState(false);
  const [assetFilterStatus, setAssetFilterStatus] = useState('');
  const [assetFilterCategoryId, setAssetFilterCategoryId] = useState('');
  const [assetFilterLocationId, setAssetFilterLocationId] = useState('');
  const [assetFilterCostCenterId, setAssetFilterCostCenterId] = useState('');

  const scopedData = useMemo(() => filterAppDataByUserScope(data, user), [data, user]);

  const assetFilterLocationOptions = useMemo(
    () => filterLocationsForUserPick(data.locations, user),
    [data.locations, user]
  );
  const assetFilterCcOptions = useMemo(
    () => filterCostCentersForUserPick(data.costCenters, user),
    [data.costCenters, user]
  );

  const filteredAssetsForList = useMemo(() => {
    let list = scopedData.assets;
    const q = assetSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.description.toLowerCase().includes(q) ||
          a.asset_code.toLowerCase().includes(q) ||
          (a.patrimonial_code || '').toLowerCase().includes(q)
      );
    }
    if (assetFilterStatus) list = list.filter((a) => a.status === assetFilterStatus);
    if (assetFilterCategoryId) list = list.filter((a) => a.category_id === assetFilterCategoryId);
    if (assetFilterLocationId) list = list.filter((a) => a.location_id === assetFilterLocationId);
    if (assetFilterCostCenterId) list = list.filter((a) => a.cost_center_id === assetFilterCostCenterId);
    return list;
  }, [
    scopedData.assets,
    assetSearchQuery,
    assetFilterStatus,
    assetFilterCategoryId,
    assetFilterLocationId,
    assetFilterCostCenterId,
  ]);

  const assetFiltersActive =
    !!assetSearchQuery.trim() ||
    !!assetFilterStatus ||
    !!assetFilterCategoryId ||
    !!assetFilterLocationId ||
    !!assetFilterCostCenterId;

  const toast = (msg: string, type: 's' | 'e' = 's') => {
    const id = genId();
    setToasts((prev) => [...prev, { id, msg, type }]);
    const ms = type === 'e' && msg.length > 80 ? 8000 : 3000;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ms);
  };

  const applyData = (updater: (prev: AppData) => AppData) => {
    setData((prev) => {
      const next = updater(prev);
      syncAppDataToSupabase(prev, next).catch((err) => {
        console.error('Falha ao sincronizar com o Supabase', err);
        toast(
          humanizeNetworkError(
            err,
            err instanceof Error ? err.message : 'Não foi possível salvar no servidor. Verifique a conexão ou faça login novamente.'
          ),
          'e'
        );
      });
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async (session: Session | null) => {
      if (!mounted) return;

      if (!session?.user) {
        setUser(null);
        setIsLoggedIn(false);
        setData(emptyAppData());
        setIsAuthReady(true);
        return;
      }

      const { data: profRow, error: profErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profErr || !profRow) {
        console.error(profErr);
        await supabase.auth.signOut();
        setUser(null);
        setIsLoggedIn(false);
        setData(emptyAppData());
        setIsAuthReady(true);
        toast(
          profErr ?
            humanizeNetworkError(profErr, profErr.message || 'Erro ao carregar perfil.')
          : 'Perfil não encontrado. Verifique se o schema SQL (tabela profiles + trigger) foi aplicado.',
          'e'
        );
        return;
      }

      setUser(profileRowToUser(profRow as any));
      setIsLoggedIn(true);

      try {
        let loaded = await loadAppDataFromSupabase();
        const seedDemo =
          import.meta.env.VITE_SEED_DEMO_DATA === 'true' || import.meta.env.VITE_SEED_DEMO_DATA === '1';
        if (seedDemo) {
          await seedSupabaseIfEmpty(buildSeedPayload(), { defaultResponsibleId: session.user.id });
          loaded = await loadAppDataFromSupabase();
        }
        setData(loaded);
      } catch (e) {
        console.error('Erro ao carregar dados:', e);
        setData({
          ...emptyAppData(),
          users: [profileRowToUser(profRow as any)],
        });
        toast(
          humanizeNetworkError(e, 'Erro ao sincronizar dados. Tente novamente ou verifique a conexão.'),
          'e'
        );
      }
      setIsAuthReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      void bootstrap(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const getTitle = () => {
    switch (currentRoute) {
      case 'dashboard': return 'Dashboard';
      case 'assets': return 'Ativos';
      case 'asset-detail': return 'Detalhes do Ativo';
      case 'assets-new': return 'Novo Ativo';
      case 'assets-edit': return 'Editar Ativo';
      case 'movements': return 'Movimentações';
      case 'movements-new': return 'Nova Movimentação';
      case 'movements-edit': return 'Editar Movimentação';
      case 'maintenance': return 'Manutenção';
      case 'disposals': return 'Baixas';
      case 'audit': return 'Auditoria';
      case 'settings': return 'Cadastros';
      case 'settings-category-edit': return 'Editar Categoria';
      case 'settings-location-edit': return 'Editar Localização';
      case 'settings-costcenter-edit': return 'Editar Centro de Custo';
      case 'settings-supplier-edit': return 'Editar Fornecedor';
      case 'admin-users': return 'Usuários';
      case 'admin-user-new': return 'Novo Usuário';
      case 'admin-user-edit': return 'Editar Usuário';
      default: return 'Sistema';
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      document.title = 'ATTIVOS';
    } else {
      const title = getTitle();
      document.title = `ATTIVOS - ${title}`;
    }
  }, [isLoggedIn, currentRoute]);

  useEffect(() => {
    if (isLoggedIn || !isAuthReady) return;
    let cancelled = false;
    if (!supabaseConfigured) {
      setSupabaseReach('misconfigured');
      return;
    }
    setSupabaseReach('checking');
    void checkSupabaseReachable().then((r) => {
      if (cancelled) return;
      setSupabaseReach(r === 'ok' ? 'ok' : r === 'misconfigured' ? 'misconfigured' : 'unreachable');
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isAuthReady]);

  const resolveLoginEmail = (raw: string) => {
    const t = raw.trim();
    if (t.toLowerCase() === 'admin') {
      const fallback = import.meta.env.VITE_DEFAULT_ADMIN_EMAIL as string | undefined;
      return (fallback || t).trim();
    }
    return t;
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = resolveLoginEmail(loginForm.email);
    const pass = loginForm.pass.trim();

    if (authMode === 'signup') {
      const allow = import.meta.env.VITE_ALLOW_SIGNUP === 'true' || import.meta.env.VITE_ALLOW_SIGNUP === '1';
      if (!allow) {
        toast('Cadastro público desativado. Peça um convite ao administrador.', 'e');
        return;
      }
      const name = loginForm.displayName.trim();
      if (!name) {
        toast('Informe o nome completo.', 'e');
        return;
      }
      const { error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: { data: { name, role: 'operador' } },
      });
      if (error) {
        toast(humanizeNetworkError(error, error.message), 'e');
        return;
      }
      toast(
        'Conta criada. Se a confirmação por e-mail estiver ativa no Supabase, verifique a caixa de entrada.',
        's'
      );
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) {
      toast(humanizeNetworkError(error, error.message), 'e');
      return;
    }
  };

  const navigate = (route: string, params: any = {}) => {
    // Proteção de rotas por perfil
    if (user?.role === 'viewer') {
      const restrictedActions = ['assets-new', 'assets-edit', 'maintenance-new', 'admin-user-new', 'admin-user-edit', 'settings-category-edit', 'settings-location-edit', 'settings-costcenter-edit', 'settings-supplier-edit'];
      if (restrictedActions.some(r => route === r)) {
        toast('Seu perfil de visualizador não permite realizar alterações', 'e');
        return;
      }
    }
    
    // Apenas admins podem acessar gestão de usuários
    if (user?.role !== 'admin' && route.startsWith('admin-')) {
       toast('Acesso restrito a administradores', 'e');
       return;
    }

    setCurrentRoute(route);
    setRouteParams(params);
    setIsSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  const handleSaveAssetHistory = async (assetId: string, text: string) => {
    if (!user) return;
    const history: AssetHistory = {
      id: genId(),
      asset_id: assetId,
      date: new Date().toISOString(),
      responsible: user.name,
      text
    };
    try {
      applyData((prev) => ({ ...prev, assetHistory: [...prev.assetHistory, history] }));
      toast('Registro adicionado ao histórico!');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'assetHistory');
    }
  };

  const handleSaveDisposal = async (d: Disposal) => {
    try {
      if (!user) return;
      let newStatus: AssetStatus = 'disposed';
      if (d.reason === 'scrap') newStatus = 'scrapped';
      if (d.reason === 'theft') newStatus = 'stolen';

      const history: AssetHistory = {
        id: genId(),
        asset_id: d.asset_id,
        date: new Date().toISOString(),
        responsible: user.name,
        text: `Ativo baixado. Motivo: ${DISPOSAL_LABELS[d.reason]}. Justificativa: ${d.description}`
      };
      const audit: AuditLog = {
        id: genId(),
        action: 'Baixa',
        entity_type: 'Ativo',
        description: `Baixa do ativo ${d.asset_id}`,
        user_email: user.email,
        created_at: new Date().toISOString()
      };

      applyData((prev) => ({
        ...prev,
        disposals: [...prev.disposals, d],
        assets: prev.assets.map((a) => (a.id === d.asset_id ? { ...a, status: newStatus } : a)),
        assetHistory: [...prev.assetHistory, history],
        auditLogs: [...prev.auditLogs, audit]
      }));
      toast('Baixa realizada com sucesso!');
      navigate('disposals');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'disposals');
    }
  };

  const handleSaveAsset = async (asset: Asset) => {
    try {
      const scopeErr = validateAssetWithinUserScope(asset, user);
      if (scopeErr) {
        toast(scopeErr, 'e');
        return;
      }
      const prev = data.assets.find((a) => a.id === asset.id);
      const isNew = !prev;
      const code = (asset.asset_code || '').trim();
      const persisted: Asset = isNew
        ? { ...asset, asset_code: code, label_scan_value: code }
        : {
            ...asset,
            asset_code: prev.asset_code,
            label_scan_value: prev.label_scan_value || prev.asset_code,
          };
      applyData((prevData) => {
        const log =
          user ?
            ({
              id: genId(),
              action: isNew ? 'Criação' : 'Edição',
              entity_type: 'Ativo',
              description: `${isNew ? 'Criou' : 'Editou'} o ativo ${persisted.asset_code}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prevData,
          assets: isNew ? [...prevData.assets, persisted] : prevData.assets.map((a) => (a.id === asset.id ? persisted : a)),
          auditLogs: log ? [...prevData.auditLogs, log] : prevData.auditLogs
        };
      });
      toast('Ativo salvo com sucesso!');
      navigate('asset-detail', { id: persisted.id });
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'assets');
    }
  };

  const handleImportCSV = async (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
      complete: (results) => {
        const prereq = validateImportPrerequisites(data);
        if (prereq.ok === false) {
          console.error(prereq.log);
          toast(prereq.message, 'e');
          return;
        }

        const allRows = results.data as Record<string, unknown>[];
        const dataRows: { line: number; row: Record<string, unknown> }[] = [];
        allRows.forEach((row, idx) => {
          if (isCsvRowEffectivelyEmpty(row)) return;
          dataRows.push({ line: idx + 2, row });
        });

        if (dataRows.length === 0) {
          const msg = 'Nenhuma linha de dados no arquivo (após o cabeçalho).';
          console.error('[Importação CSV]', msg);
          toast(msg, 'e');
          return;
        }

        const errorLines: string[] = [];
        const validated: { line: number; row: Record<string, unknown>; refs: ResolvedImportRefs }[] = [];
        for (const { line, row } of dataRows) {
          const v = validateAssetImportRow(row, line, data);
          if (v.ok === false) {
            v.errors.forEach((e) => errorLines.push(`Linha ${line}: ${e}`));
          } else {
            validated.push({ line, row, refs: v.refs });
          }
        }

        if (errorLines.length > 0) {
          const log = '[Importação CSV — erros por linha]\n' + errorLines.join('\n');
          console.error(log);
          toast(
            `Importação cancelada: ${errorLines.length} erro(s). Abra o console (F12 → Console) para o relatório completo.`,
            'e'
          );
          return;
        }

        const scopeErrors: string[] = [];
        const staged: Asset[] = [];
        for (const { line, row, refs: r } of validated) {
          const impCode = generateNextAssetCode([...data.assets, ...staged]);
          const asset: Asset = {
            id: genId(),
            asset_code: impCode,
            label_scan_value: impCode,
            patrimonial_code: String(row['Código Patrimonial'] ?? '').trim() || undefined,
            description: String(row['Descrição'] ?? '').trim(),
            status: parseImportedAssetStatus(
              String(row[ASSET_IMPORT_STATUS_COLUMN] ?? row[ASSET_IMPORT_STATUS_COLUMN_LEGACY] ?? '')
            ),
            category_id: r.category.id,
            cost_center_id: r.costCenter.id,
            location_id: r.location.id,
            responsible_id: r.responsible.id,
            acquisition_value: parseFloat(String(row['Valor de Aquisição'] ?? '').replace(',', '.')) || 0,
            acquisition_date:
              String(row['Data de Aquisição (YYYY-MM-DD)'] ?? '').trim() ||
              new Date().toISOString().split('T')[0],
            serial_number: String(row['Número de Série'] ?? '').trim() || undefined,
            manufacturer: String(row['Fabricante'] ?? '').trim() || undefined,
            brand: String(row['Marca'] ?? '').trim() || undefined,
            model: String(row['Modelo'] ?? '').trim() || undefined,
            invoice_number: String(row['Número da Nota Fiscal'] ?? '').trim() || undefined,
            useful_life_months: parseInt(String(row['Vida Útil (Meses)'] ?? ''), 10) || 0,
            observations: String(row['Observações'] ?? '').trim() || undefined,
          };
          const scopeErr = validateAssetWithinUserScope(asset, user);
          if (scopeErr) {
            scopeErrors.push(`Linha ${line}: ${scopeErr}`);
          } else {
            staged.push(asset);
          }
        }

        if (scopeErrors.length > 0) {
          const log = '[Importação CSV — escopo do usuário]\n' + scopeErrors.join('\n');
          console.error(log);
          toast(
            `Importação cancelada: ${scopeErrors.length} linha(s) fora do seu escopo. Veja o console (F12) para detalhes.`,
            'e'
          );
          return;
        }

        const importedCount = staged.length;
        const importUser = user;

        applyData((prev) => {
          const nextAssets = [...prev.assets, ...staged];
          const log =
            importUser && importedCount > 0 ?
              ({
                id: genId(),
                action: 'Importação',
                entity_type: 'Ativo',
                description: `Importou ${importedCount} ativos via CSV`,
                user_email: importUser.email,
                created_at: new Date().toISOString()
              } satisfies AuditLog)
            : null;

          return {
            ...prev,
            assets: nextAssets,
            auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
          };
        });

        toast(`${importedCount} ativo(s) importado(s) com sucesso!`);
      },
      error: (error) => {
        toast('Erro ao processar arquivo CSV: ' + error.message, 'e');
      }
    });
  };

  const handleSaveMaintenance = async (m: MaintenanceOrder) => {
    try {
      applyData((prev) => {
        const isNew = !prev.maintenanceOrders.find((mo) => mo.id === m.id);
        const asset = prev.assets.find((a) => a.id === m.asset_id);
        let nextAssets = prev.assets;
        let nextHistory = prev.assetHistory;
        let nextAudit = prev.auditLogs;

        const orders = isNew ? [...prev.maintenanceOrders, m] : prev.maintenanceOrders.map((mo) => (mo.id === m.id ? m : mo));

        if (asset) {
          let newStatus = asset.status;
          if (m.status === 'open' || m.status === 'in_progress') {
            newStatus = 'maintenance';
          } else if (m.status === 'completed' || m.status === 'cancelled') {
            if (!['disposed', 'scrapped', 'stolen'].includes(asset.status)) {
              newStatus = 'active';
            }
          }
          nextAssets = prev.assets.map((a) => (a.id === m.asset_id ? { ...a, status: newStatus } : a));
          if (user) {
            const h: AssetHistory = {
              id: genId(),
              asset_id: m.asset_id,
              date: new Date().toISOString(),
              responsible: user.name,
              text: `${isNew ? 'Nova' : 'Atualização de'} ordem de manutenção #${m.order_number}. Status: ${MAINT_STATUS_LABELS[m.status] ?? m.status}`
            };
            nextHistory = [...prev.assetHistory, h];
          }
        }

        if (user) {
          const log: AuditLog = {
            id: genId(),
            action: isNew ? 'Criação' : 'Edição',
            entity_type: 'Manutenção',
            description: `${isNew ? 'Criou' : 'Editou'} a OM #${m.order_number}`,
            user_email: user.email,
            created_at: new Date().toISOString()
          };
          nextAudit = [...prev.auditLogs, log];
        }

        return {
          ...prev,
          maintenanceOrders: orders,
          assets: nextAssets,
          assetHistory: nextHistory,
          auditLogs: nextAudit
        };
      });
      toast('Ordem de manutenção salva!');
      navigate('maintenance');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'maintenanceOrders');
    }
  };

  const handleDeleteMaintenance = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta ordem de manutenção?')) return;
    try {
      applyData((prev) => {
        const mData = prev.maintenanceOrders.find((mo) => mo.id === id);
        if (!mData) return prev;
        let nextAssets = prev.assets;
        const asset = prev.assets.find((a) => a.id === mData.asset_id);
        if (asset?.status === 'maintenance') {
          nextAssets = prev.assets.map((a) => (a.id === mData.asset_id ? { ...a, status: 'active' as const } : a));
        }
        let nextAudit = prev.auditLogs;
        if (user) {
          nextAudit = [
            ...prev.auditLogs,
            {
              id: genId(),
              action: 'Exclusão',
              entity_type: 'Manutenção',
              description: `Excluiu a OM #${mData.order_number}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            }
          ];
        }
        return {
          ...prev,
          maintenanceOrders: prev.maintenanceOrders.filter((mo) => mo.id !== id),
          assets: nextAssets,
          auditLogs: nextAudit
        };
      });
      toast('Ordem de manutenção excluída!');
      navigate('maintenance');
    } catch (error) {
      handleStoreError(error, OperationType.DELETE, 'maintenanceOrders');
    }
  };

  const handleSaveMovement = async (mv: Movement) => {
    try {
      applyData((prev) => {
        const isNew = !prev.movements.find((m) => m.id === mv.id);
        const asset = prev.assets.find((a) => a.id === mv.asset_id);
        let nextAssets = prev.assets;
        let nextHistory = prev.assetHistory;
        let nextAudit = prev.auditLogs;

        const movements = isNew ? [...prev.movements, mv] : prev.movements.map((m) => (m.id === mv.id ? mv : m));

        if (asset) {
          const updates: Record<string, string> = {};
          if (mv.to_location) {
            const loc = prev.locations.find((l) => l.name === mv.to_location || l.id === mv.to_location);
            if (loc) updates.location_id = loc.id;
          }
          if (mv.to_cost_center) {
            const cc = prev.costCenters.find((c) => c.name === mv.to_cost_center || c.id === mv.to_cost_center);
            if (cc) updates.cost_center_id = cc.id;
          }
          if (mv.to_responsible) {
            const u = prev.users.find((x) => x.name === mv.to_responsible || x.id === mv.to_responsible);
            if (u) updates.responsible_id = u.id;
          }
          if (Object.keys(updates).length > 0) {
            nextAssets = prev.assets.map((a) => (a.id === mv.asset_id ? { ...a, ...updates } : a));
          }
          if (user) {
            const h: AssetHistory = {
              id: genId(),
              asset_id: mv.asset_id,
              date: new Date().toISOString(),
              responsible: user.name,
              text: `Movimentação: ${MOVEMENT_TYPE_LABELS[mv.movement_type] ?? mv.movement_type}. Destino: ${mv.to_location || mv.to_cost_center || mv.to_responsible || '—'}`
            };
            nextHistory = [...prev.assetHistory, h];
          }
        }

        if (user) {
          const log: AuditLog = {
            id: genId(),
            action: isNew ? 'Criação' : 'Edição',
            entity_type: 'Movimentação',
            description: `${isNew ? 'Registrou' : 'Editou'} movimentação do ativo ${mv.asset_id}`,
            user_email: user.email,
            created_at: new Date().toISOString()
          };
          nextAudit = [...prev.auditLogs, log];
        }

        return {
          ...prev,
          movements,
          assets: nextAssets,
          assetHistory: nextHistory,
          auditLogs: nextAudit
        };
      });
      toast('Movimentação salva!');
      navigate('movements');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'movements');
    }
  };

  const handleDeleteMovement = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta movimentação?')) return;
    try {
      applyData((prev) => ({ ...prev, movements: prev.movements.filter((m) => m.id !== id) }));
      toast('Movimentação excluída!');
      navigate('movements');
    } catch (error) {
      handleStoreError(error, OperationType.DELETE, 'movements');
    }
  };

  const handleSaveCategory = async (c: Category) => {
    try {
      const isNew = !data.categories.find((cat) => cat.id === c.id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: isNew ? 'Criação' : 'Edição',
              entity_type: 'Categoria',
              description: `${isNew ? 'Criou' : 'Editou'} a categoria ${c.name}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          categories: isNew ? [...prev.categories, c] : prev.categories.map((x) => (x.id === c.id ? c : x)),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Categoria salva!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'categories');
    }
  };

  const handleSaveLocation = async (l: Location) => {
    try {
      const isNew = !data.locations.find((loc) => loc.id === l.id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: isNew ? 'Criação' : 'Edição',
              entity_type: 'Localização',
              description: `${isNew ? 'Criou' : 'Editou'} a localização ${l.name}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          locations: isNew ? [...prev.locations, l] : prev.locations.map((x) => (x.id === l.id ? l : x)),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Localização salva!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'locations');
    }
  };

  const handleSaveCostCenter = async (cc: CostCenter) => {
    try {
      const isNew = !data.costCenters.find((c) => c.id === cc.id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: isNew ? 'Criação' : 'Edição',
              entity_type: 'Centro de Custo',
              description: `${isNew ? 'Criou' : 'Editou'} o centro de custo ${cc.name}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          costCenters: isNew ? [...prev.costCenters, cc] : prev.costCenters.map((x) => (x.id === cc.id ? cc : x)),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Centro de custo salvo!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'costCenters');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta categoria?')) return;
    try {
      const c = data.categories.find((x) => x.id === id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: 'Exclusão',
              entity_type: 'Categoria',
              description: `Excluiu a categoria ${c?.name || id}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          categories: prev.categories.filter((x) => x.id !== id),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Categoria excluída!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.DELETE, 'categories');
    }
  };

  const handleDeleteLocation = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir esta localização?')) return;
    try {
      const l = data.locations.find((x) => x.id === id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: 'Exclusão',
              entity_type: 'Localização',
              description: `Excluiu a localização ${l?.name || id}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          locations: prev.locations.filter((x) => x.id !== id),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Localização excluída!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.DELETE, 'locations');
    }
  };

  const handleDeleteCostCenter = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este centro de custo?')) return;
    try {
      const cc = data.costCenters.find((x) => x.id === id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: 'Exclusão',
              entity_type: 'Centro de Custo',
              description: `Excluiu o centro de custo ${cc?.name || id}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          costCenters: prev.costCenters.filter((x) => x.id !== id),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Centro de custo excluído!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.DELETE, 'costCenters');
    }
  };

  const handleSaveSupplier = async (s: Supplier) => {
    try {
      const isNew = !data.suppliers.find((sup) => sup.id === s.id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: isNew ? 'Criação' : 'Edição',
              entity_type: 'Fornecedor',
              description: `${isNew ? 'Criou' : 'Editou'} o fornecedor ${s.name}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          suppliers: isNew ? [...prev.suppliers, s] : prev.suppliers.map((x) => (x.id === s.id ? s : x)),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Fornecedor salvo!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.WRITE, 'suppliers');
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este fornecedor?')) return;
    try {
      const s = data.suppliers.find((x) => x.id === id);
      applyData((prev) => {
        const log =
          user ?
            ({
              id: genId(),
              action: 'Exclusão',
              entity_type: 'Fornecedor',
              description: `Excluiu o fornecedor ${s?.name || id}`,
              user_email: user.email,
              created_at: new Date().toISOString()
            } satisfies AuditLog)
          : null;
        return {
          ...prev,
          suppliers: prev.suppliers.filter((x) => x.id !== id),
          auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs
        };
      });
      toast('Fornecedor excluído!');
      navigate('settings');
    } catch (error) {
      handleStoreError(error, OperationType.DELETE, 'suppliers');
    }
  };

  const handleSaveUser = async (u: User) => {
    try {
      const isNewUser = !data.users.find((existing) => existing.id === u.id);
      const locIds = u.role === 'admin' ? [] : (u.allowed_location_ids ?? []);
      const ccIds = u.role === 'admin' ? [] : (u.allowed_cost_center_ids ?? []);

      if (isNewUser) {
        const pwd = u.password?.trim();
        if (!pwd) {
          toast('Defina a senha do novo usuário.', 'e');
          return;
        }
        const { userId } = await invokeAdminCreateUser({
          email: u.email.trim(),
          password: pwd,
          name: u.name.trim(),
          role: u.role,
        });
        const { error: scopeErr } = await supabase
          .from('profiles')
          .update({ allowed_location_ids: locIds, allowed_cost_center_ids: ccIds })
          .eq('id', userId);
        if (scopeErr) throw scopeErr;
        toast('Usuário criado. Ele pode precisar confirmar o e-mail, conforme as regras do Supabase Auth.');
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({
            name: u.name.trim(),
            role: u.role,
            allowed_location_ids: locIds,
            allowed_cost_center_ids: ccIds,
          })
          .eq('id', u.id);
        if (error) throw error;
        const pwd = u.password?.trim();
        if (pwd) {
          await invokeAdminUpdateUserPassword(u.id, pwd);
        }
        toast('Usuário atualizado.');
      }

      const fresh = await loadAppDataFromSupabase();
      setData(fresh);
      if (!isNewUser && user?.id === u.id) {
        const me = fresh.users.find((x) => x.id === u.id);
        if (me) setUser(me);
      }
      navigate('admin-users');
    } catch (error: any) {
      console.error(error);
      toast(humanizeNetworkError(error, error?.message || 'Falha ao salvar usuário.'), 'e');
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === user?.id) {
      toast('Você não pode excluir seu próprio usuário', 'e');
      return;
    }
    if (!window.confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      await invokeAdminDeleteUser(id);
      const fresh = await loadAppDataFromSupabase();
      setData(fresh);
      toast('Usuário excluído com sucesso!');
      navigate('admin-users');
    } catch (error: any) {
      console.error(error);
      toast(humanizeNetworkError(error, error?.message || 'Falha ao excluir usuário.'), 'e');
    }
  };

  const handleDeleteAsset = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este ativo permanentemente? Esta ação não pode ser desfeita.')) return;
    const a = data.assets.find((x) => x.id === id);
    let syncPrev!: AppData;
    let syncNext!: AppData;
    setData((prev) => {
      syncPrev = prev;
      const log =
        user ?
          ({
            id: genId(),
            action: 'Exclusão',
            entity_type: 'Ativo',
            description: `Excluiu permanentemente o ativo ${a?.asset_code || id}`,
            user_email: user.email,
            created_at: new Date().toISOString()
          } satisfies AuditLog)
        : null;
      syncNext = {
        ...prev,
        assets: prev.assets.filter((x) => x.id !== id),
        maintenanceOrders: prev.maintenanceOrders.filter((m) => m.asset_id !== id),
        movements: prev.movements.filter((m) => m.asset_id !== id),
        disposals: prev.disposals.filter((d) => d.asset_id !== id),
        assetHistory: prev.assetHistory.filter((h) => h.asset_id !== id),
        auditLogs: log ? [...prev.auditLogs, log] : prev.auditLogs,
      };
      return syncNext;
    });
    try {
      await syncAppDataToSupabase(syncPrev, syncNext);
      toast('Ativo excluído com sucesso!');
      navigate('assets');
    } catch (error: unknown) {
      setData(syncPrev);
      console.error(error);
        toast(
          humanizeNetworkError(
            error,
            error instanceof Error ? error.message : 'Não foi possível excluir o ativo no Supabase.'
          ),
          'e'
        );
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-brand animate-pulse font-black text-xl">Carregando...</div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <ErrorBoundary>
        <div id="login-screen">
          <div className="bg-glow"></div>
          <div className="login-card glass p-8 w-full max-w-[400px]">
            {supabaseReach === 'misconfigured' && (
              <div
                className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-xs leading-relaxed text-amber-200"
                role="alert"
              >
                <strong className="block font-bold text-amber-100">Supabase não configurado no build</strong>
                Crie o arquivo <code className="rounded bg-black/20 px-1">attivos/.env</code> com{' '}
                <code className="rounded bg-black/20 px-1">VITE_SUPABASE_URL</code> e{' '}
                <code className="rounded bg-black/20 px-1">VITE_SUPABASE_ANON_KEY</code> (veja{' '}
                <code className="rounded bg-black/20 px-1">.env.example</code>) e reinicie{' '}
                <code className="rounded bg-black/20 px-1">npm run dev</code>.
              </div>
            )}
            {supabaseReach === 'unreachable' && (
              <div
                className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-left text-xs leading-relaxed text-red-200/95"
                role="alert"
              >
                <strong className="block font-bold text-red-100">Não foi possível contatar o Supabase</strong>
                O navegador não alcançou o host do projeto (teste em{' '}
                <code className="rounded bg-black/20 px-1">/auth/v1/health</code>). Confira: internet e VPN;
                projeto ativo no painel (não pausado); firewall/antivírus; extensões que bloqueiam requisições.
                Se usar outra máquina na rede, confirme se a URL do <code className="rounded bg-black/20 px-1">.env</code>{' '}
                está correta.
              </div>
            )}
            {supabaseReach === 'checking' && (
              <div className="mb-4 text-center text-[11px] font-medium text-text3">Verificando conexão com o servidor…</div>
            )}
            <div className="flex justify-center mb-8">
              <div className="relative h-16 w-full flex items-center justify-center">
                {/* Usando o arquivo SVG oficial fornecido pelo usuário */}
                <img 
                  src="/logo.svg" 
                  alt="Logo Attivos" 
                  className="h-full w-full max-w-[200px] object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="text-xs font-medium text-text2 mb-1.5 block">Nome completo</label>
                  <input
                    className="inp w-full px-4 py-2.5 bg-bg3/50 border-white/5 focus:border-brand/50 transition-all rounded-lg text-sm"
                    type="text"
                    autoComplete="name"
                    placeholder="Seu nome"
                    value={loginForm.displayName}
                    onChange={(e) => setLoginForm({ ...loginForm, displayName: e.target.value })}
                    required={authMode === 'signup'}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-text2 mb-1.5 block">E-mail</label>
                <input
                  className="inp w-full px-4 py-2.5 bg-bg3/50 border-white/5 focus:border-brand/50 transition-all rounded-lg text-sm"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-text2 mb-1.5 block">Senha</label>
                <input
                  className="inp w-full px-4 py-2.5 bg-bg3/50 border-white/5 focus:border-brand/50 transition-all rounded-lg text-sm"
                  type="password"
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  placeholder="••••••••••••"
                  value={loginForm.pass}
                  onChange={(e) => setLoginForm({ ...loginForm, pass: e.target.value })}
                  required
                />
              </div>

              <div className="pt-2">
                <button type="submit" className="btn btn-p w-full justify-center py-3 text-sm font-bold rounded-lg shadow-lg shadow-brand/20">
                  {authMode === 'signup' ? 'Cadastrar' : 'Entrar'}
                </button>
              </div>
            </form>

            {(import.meta.env.VITE_ALLOW_SIGNUP === 'true' || import.meta.env.VITE_ALLOW_SIGNUP === '1') && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  className="text-xs text-brand2 font-bold hover:underline"
                  onClick={() => {
                    setAuthMode((m) => (m === 'login' ? 'signup' : 'login'));
                    setLoginForm((f) => ({ ...f, displayName: '' }));
                  }}
                >
                  {authMode === 'login' ? 'Criar conta' : 'Já tenho conta — entrar'}
                </button>
              </div>
            )}
          </div>
        </div>
        <div id="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span>{t.type === 's' ? '✅' : '❌'}</span>
              {t.msg}
            </div>
          ))}
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div id="app">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar Wrapper */}
      <div className={`fixed top-0 left-0 z-50 transition-transform duration-300 h-screen w-64 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <Sidebar currentRoute={currentRoute} onNavigate={navigate} onLogout={handleLogout} user={user || { name: '', email: '', role: '' }} />
      </div>

      <div id="main" className="flex-1 flex flex-col min-w-0 md:ml-64">
        <header id="topbar">
          <div className="flex items-center gap-4">
            <button className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-bg4 text-text2 hover:text-text transition-colors" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <div className="text-[10px] text-text3 font-bold uppercase tracking-widest leading-none mb-1">Sistema</div>
              <div className="text-sm font-bold text-text tracking-tight leading-none">ATTIVOS - {getTitle()}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 flex items-center justify-center rounded-xl text-text3 hover:text-text hover:bg-bg4 transition-all" onClick={() => toast('Você não possui novas notificações')}>
              <Bell size={18} />
            </button>
            <button className="w-10 h-10 flex items-center justify-center rounded-xl text-text3 hover:text-red-400 hover:bg-red-500/10 transition-all" onClick={() => handleLogout()}>
              <LogOut size={18} />
            </button>
            <div className="flex items-center gap-3 border-l border-border pl-4">
              <div className="text-right hidden sm:block">
                <div className="text-[13px] font-bold text-text">{user?.name}</div>
                <div className="text-[10px] text-text3 font-medium tracking-wider">
                  {user?.role ? USER_ROLE_LABELS[user.role] ?? user.role : ''}
                </div>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-brand2 flex items-center justify-center text-xs font-black text-white shadow-lg shadow-brand/20">
                {user?.name.split(' ').map((n: string) => n[0]).join('')}
              </div>
            </div>
          </div>
        </header>
        <main id="content">
          <AnimatePresence mode="wait">
            {currentRoute === 'dashboard' && <Dashboard key="dash" data={scopedData} onNavigate={navigate} user={user} onToast={toast} />}
            {currentRoute === 'assets' && (
              <motion.div 
                key="assets" 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <div className="hrow">
                  <div>
                    <h1 className="pt">Ativos</h1>
                    <p className="ps">
                      {filteredAssetsForList.length === scopedData.assets.length ?
                        `${scopedData.assets.length} ativo(s) no patrimônio`
                      : `${filteredAssetsForList.length} de ${scopedData.assets.length} ativo(s) (busca ou filtros ativos)`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ExportBar
                      ariaLabel="Exportar lista de ativos"
                      onExport={(type) => {
                        const h = {
                          asset_code: 'Código',
                          description: 'Descrição',
                          status: 'Status',
                          acquisition_date: 'Data Aquisição',
                          acquisition_value: 'Valor',
                        };
                        const rows = assetsWithLocalizedStatusForExport(filteredAssetsForList);
                        exportReport(
                          type,
                          rows,
                          {
                            filename: 'ativos',
                            pdfTitle: 'Relatório de Ativos',
                            headers: h,
                            emptyMessage: 'Não há ativos para exportar.',
                          },
                          toast
                        );
                      }}
                    />
                    {user?.role !== 'viewer' && (
                      <>
                        <div className="relative">
                          <button className="btn btn-s" onClick={() => setShowImportMenu(!showImportMenu)}><BarChart2 size={16} className="mr-2" /> Importar</button>
                          {showImportMenu && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setShowImportMenu(false)}></div>
                              <div className="absolute right-0 top-full mt-1 w-48 glass p-2 z-50 shadow-xl border border-white/10">
                                <button className="w-full text-left p-2 hover:bg-white/5 rounded text-xs flex items-center gap-2" onClick={() => { downloadImportTemplate(); setShowImportMenu(false); }}>
                                  <Download size={14} /> Baixar Modelo
                                </button>
                                <label className="w-full text-left p-2 hover:bg-white/5 rounded text-xs flex items-center gap-2 cursor-pointer">
                                  <FileText size={14} /> Selecionar Arquivo
                                  <input 
                                    type="file" 
                                    className="hidden" 
                                    accept=".csv" 
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleImportCSV(file);
                                      e.target.value = '';
                                      setShowImportMenu(false);
                                    }} 
                                  />
                                </label>
                              </div>
                            </>
                          )}
                        </div>
                        <button className="btn btn-p" onClick={() => navigate('assets-new')}>＋ Novo Ativo</button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="glass p-3 mb-4 flex flex-wrap gap-3">
                  <div className="relative min-w-[200px] flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={18} />
                    <input
                      className="inp pl-10 w-full"
                      placeholder="Buscar por descrição, código ou patrimônio..."
                      value={assetSearchQuery}
                      onChange={(e) => setAssetSearchQuery(e.target.value)}
                      aria-label="Buscar ativos"
                    />
                  </div>
                  <div className="flex bg-bg4 p-1 rounded-xl border border-border shrink-0">
                    <button 
                      className={`p-2 rounded-lg transition-all ${assetViewMode === 'table' ? 'bg-white text-brand shadow-sm' : 'text-text3 hover:text-text'}`}
                      onClick={() => setAssetViewMode('table')}
                      title="Visualização em Lista"
                      type="button"
                    >
                      <List size={18} />
                    </button>
                    <button 
                      className={`p-2 rounded-lg transition-all ${assetViewMode === 'cards' ? 'bg-white text-brand shadow-sm' : 'text-text3 hover:text-text'}`}
                      onClick={() => setAssetViewMode('cards')}
                      title="Visualização em Cards"
                      type="button"
                    >
                      <LayoutGrid size={18} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className={`btn btn-s shrink-0 ${showAssetFilters ? 'ring-2 ring-brand2/40' : ''} ${assetFiltersActive ? 'border border-brand2/30' : ''}`}
                    onClick={() => setShowAssetFilters((v) => !v)}
                    title={showAssetFilters ? 'Ocultar filtros' : 'Mostrar filtros por status, categoria, local e centro de custo'}
                  >
                    <Filter size={18} className="mr-1" /> Filtros
                  </button>
                </div>

                {showAssetFilters && (
                  <div className="glass p-4 mb-6 border border-white/10">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-text3">Filtrar lista</span>
                      {assetFiltersActive && (
                        <button
                          type="button"
                          className="text-[11px] font-bold text-brand2 hover:underline"
                          onClick={() => {
                            setAssetSearchQuery('');
                            setAssetFilterStatus('');
                            setAssetFilterCategoryId('');
                            setAssetFilterLocationId('');
                            setAssetFilterCostCenterId('');
                          }}
                        >
                          Limpar busca e filtros
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="lbl text-[10px]">Status</label>
                        <select
                          className="inp"
                          value={assetFilterStatus}
                          onChange={(e) => setAssetFilterStatus(e.target.value)}
                        >
                          <option value="">Todos</option>
                          {Object.entries(STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="lbl text-[10px]">Categoria</label>
                        <select
                          className="inp"
                          value={assetFilterCategoryId}
                          onChange={(e) => setAssetFilterCategoryId(e.target.value)}
                        >
                          <option value="">Todas</option>
                          {data.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="lbl text-[10px]">Localização</label>
                        <select
                          className="inp"
                          value={assetFilterLocationId}
                          onChange={(e) => setAssetFilterLocationId(e.target.value)}
                        >
                          <option value="">Todas</option>
                          {assetFilterLocationOptions.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="lbl text-[10px]">Centro de custo</label>
                        <select
                          className="inp"
                          value={assetFilterCostCenterId}
                          onChange={(e) => setAssetFilterCostCenterId(e.target.value)}
                        >
                          <option value="">Todos</option>
                          {assetFilterCcOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {assetViewMode === 'table' ? (
                  <div className="tbl-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Descrição</th>
                          <th>Status</th>
                          <th>Localização</th>
                          <th>Valor</th>
                          <th className="text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssetsForList.length === 0 ?
                          <tr>
                            <td colSpan={6} className="py-12 text-center text-sm text-text3">
                              Nenhum ativo encontrado com os critérios atuais.
                            </td>
                          </tr>
                        : filteredAssetsForList.map((a) => (
                          <tr key={a.id} className="group cursor-pointer hover:bg-white/5" onClick={() => navigate('asset-detail', { id: a.id })}>
                            <td className="font-mono text-[11px] text-brand2 font-bold">{a.asset_code}</td>
                            <td>
                              <div className="font-bold text-text group-hover:text-brand transition-colors">{a.description}</div>
                              {a.patrimonial_code && <div className="text-[10px] text-text3 font-medium">Patrimônio: {a.patrimonial_code}</div>}
                            </td>
                            <td><Badge status={a.status} /></td>
                            <td className="text-[12px] font-medium">{data.locations.find(l => l.id === a.location_id)?.name || '—'}</td>
                            <td className="font-mono text-[11px] font-bold">{fmtCurrency(a.acquisition_value)}</td>
                            <td className="text-right">
                              <button className="btn btn-s py-1.5 px-3 text-[11px] font-bold opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0" onClick={(e) => { e.stopPropagation(); navigate('asset-detail', { id: a.id }); }}>Ver Detalhes</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredAssetsForList.length === 0 ?
                      <div className="col-span-full empty py-12">
                        <div className="empty-title">Nenhum ativo encontrado com os critérios atuais.</div>
                      </div>
                    : filteredAssetsForList.map((a) => (
                      <div key={a.id} className="glass p-5 glass-hover cursor-pointer flex flex-col" onClick={() => navigate('asset-detail', { id: a.id })}>
                        <div className="flex justify-between items-start mb-4">
                          <div className="w-10 h-10 rounded-xl bg-bg4 flex items-center justify-center text-xl">📦</div>
                          <Badge status={a.status} />
                        </div>
                        <div className="flex-1">
                          <div className="text-[10px] font-mono text-brand2 font-bold mb-1">{a.asset_code}</div>
                          <h3 className="text-sm font-bold text-text mb-2 line-clamp-2">{a.description}</h3>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2 text-[11px] text-text3">
                              <Settings size={12} />
                              <span className="truncate">{data.categories.find(c => c.id === a.category_id)?.name || 'Sem Categoria'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-text3">
                              <ArrowLeftRight size={12} />
                              <span className="truncate">{data.locations.find(l => l.id === a.location_id)?.name || 'Sem Localização'}</span>
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-border flex justify-between items-center">
                          <div className="text-[11px] font-mono font-bold text-text">{fmtCurrency(a.acquisition_value)}</div>
                          <button className="text-[10px] font-bold text-brand2 hover:underline">Ver Detalhes</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
            {currentRoute === 'asset-detail' && <AssetDetail key="detail" assetId={routeParams.id} data={scopedData} onNavigate={navigate} onAction={(type, id) => { setModal({ type, assetId: id }); setModalForm({ asset_id: id, movement_date: new Date().toISOString().slice(0, 16), disposal_date: new Date().toISOString().slice(0, 10), reason: 'other' }); }} onSaveHistory={handleSaveAssetHistory} user={user} onToast={toast} />}
            {currentRoute === 'assets-new' && <AssetForm key="new" data={data} user={user} onNavigate={navigate} onSave={handleSaveAsset} />}
            {currentRoute === 'assets-edit' && <AssetForm key="edit" assetId={routeParams.id} data={data} user={user} onNavigate={navigate} onSave={handleSaveAsset} onDelete={handleDeleteAsset} />}
            {currentRoute === 'maintenance' && (
              <MaintenanceView
                key="maint"
                data={scopedData}
                onNavigate={navigate}
                user={user}
                onDelete={handleDeleteMaintenance}
                onToast={toast}
              />
            )}
            {currentRoute === 'maintenance-new' && <MaintenanceForm key="maint-new" assetId={routeParams.assetId} data={data} user={user} onNavigate={navigate} onSave={handleSaveMaintenance} />}
            {currentRoute === 'maintenance-edit' && <MaintenanceForm key="maint-edit" orderId={routeParams.id} data={data} user={user} onNavigate={navigate} onSave={handleSaveMaintenance} onDelete={handleDeleteMaintenance} />}
            {currentRoute === 'movements' && (
              <MovementsView
                key="movements"
                data={scopedData}
                onNavigate={navigate}
                user={user}
                onDelete={handleDeleteMovement}
                onToast={toast}
              />
            )}
            {currentRoute === 'movements-new' && <MovementForm key="move-new" data={data} onNavigate={navigate} onSave={handleSaveMovement} user={user} />}
            {currentRoute === 'movements-edit' && <MovementForm key="move-edit" movementId={routeParams.id} data={data} onNavigate={navigate} onSave={handleSaveMovement} onDelete={handleDeleteMovement} user={user} />}
            {currentRoute === 'disposals' && <DisposalsView key="disposals" data={scopedData} onToast={toast} />}
            {currentRoute === 'audit' && <AuditView key="audit" data={data} onToast={toast} />}
            {currentRoute === 'settings' && (
              <SettingsView key="settings" data={data} onNavigate={navigate} user={user} onToast={toast} />
            )}
            {currentRoute === 'settings-category-edit' && <CategoryForm key="cat-edit" categoryId={routeParams.id} data={data} onNavigate={navigate} onSave={handleSaveCategory} onDelete={handleDeleteCategory} />}
            {currentRoute === 'settings-location-edit' && <LocationForm key="loc-edit" locationId={routeParams.id} data={data} onNavigate={navigate} onSave={handleSaveLocation} onDelete={handleDeleteLocation} />}
            {currentRoute === 'settings-costcenter-edit' && <CostCenterForm key="cc-edit" costCenterId={routeParams.id} data={data} onNavigate={navigate} onSave={handleSaveCostCenter} onDelete={handleDeleteCostCenter} />}
            {currentRoute === 'settings-supplier-edit' && <SupplierForm key="sup-edit" supplierId={routeParams.id} data={data} onNavigate={navigate} onSave={handleSaveSupplier} onDelete={handleDeleteSupplier} />}
            {currentRoute === 'admin-users' && (
              <AdminUsersView
                key="users"
                data={data}
                user={user}
                onNavigate={navigate}
                onDeleteUser={handleDeleteUser}
                onToast={toast}
              />
            )}
            {currentRoute === 'admin-user-new' && <UserForm key="user-new" data={data} onNavigate={navigate} onSave={handleSaveUser} />}
            {currentRoute === 'admin-user-edit' && (
              <UserForm key={`user-edit-${routeParams.id}`} userId={routeParams.id} data={data} onNavigate={navigate} onSave={handleSaveUser} onDelete={handleDeleteUser} />
            )}
            
            {/* Catch-all for unknown routes */}
            {!['dashboard', 'assets', 'asset-detail', 'assets-new', 'assets-edit', 'maintenance', 'maintenance-new', 'maintenance-edit', 'movements', 'movements-new', 'movements-edit', 'disposals', 'audit', 'settings', 'settings-category-edit', 'settings-location-edit', 'settings-costcenter-edit', 'settings-supplier-edit', 'admin-users', 'admin-user-new', 'admin-user-edit'].includes(currentRoute) && (
              <motion.div 
                key="other" 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="empty"
              >
                <div className="empty-icon">🔍</div>
                <div className="empty-title">Página não encontrada</div>
                <div className="empty-sub">A rota solicitada não existe ou você não tem permissão para acessá-la.</div>
                <button className="btn btn-p" onClick={() => navigate('dashboard')}>Voltar ao Dashboard</button>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {modal && (
        <div className="overlay open" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              {modal.type.startsWith('move') ? 'Registrar Movimentação' : 'Registrar Baixa'}
              <button className="close-btn" onClick={() => setModal(null)}>✕</button>
            </div>
            <form onSubmit={async (e) => { 
              e.preventDefault(); 
              if (modal.type.startsWith('move')) {
                const mv: Movement = {
                  id: genId(),
                  asset_id: modal.assetId,
                  movement_type: 'transfer',
                  to_location: modalForm.to_location || '',
                  to_cost_center: modalForm.to_cost_center || '',
                  to_responsible: modalForm.to_responsible || '',
                  reason: modalForm.reason || '',
                  movement_date: modalForm.movement_date || new Date().toISOString(),
                  executor: user?.name || 'Sistema'
                };
                await handleSaveMovement(mv);
              } else {
                const d: Disposal = {
                  id: genId(),
                  asset_id: modal.assetId,
                  reason: modalForm.reason || 'other',
                  description: modalForm.description || '',
                  disposal_date: modalForm.disposal_date || new Date().toISOString().slice(0, 10),
                  responsible: user?.name || 'Sistema'
                };
                await handleSaveDisposal(d);
              }
              setModal(null); 
            }}>
              <div className="mb-4">
                <label className="lbl">Ativo</label>
                {modal.type === 'move_new' ? (
                  <select className="inp" required value={modal.assetId} onChange={(e) => setModal({...modal, assetId: e.target.value})}>
                    <option value="">Selecionar Ativo...</option>
                    {filterAssetsForUserPick(
                      data.assets.filter(a => !['disposed', 'scrapped', 'stolen'].includes(a.status)),
                      user,
                      modal.assetId
                    ).map(a => (
                      <option key={a.id} value={a.id}>{a.asset_code} - {a.description}</option>
                    ))}
                  </select>
                ) : (
                  <div className="inp bg-bg2/50">{data.assets.find(a => a.id === modal.assetId)?.description || 'Selecione um ativo'}</div>
                )}
              </div>
              {modal.type.startsWith('move') ? (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="lbl">Para Localização</label>
                      <select className="inp" value={modalForm.to_location || ''} onChange={e => setModalForm({...modalForm, to_location: e.target.value})}>
                        <option value="">Selecionar...</option>
                        {filterLocationsForUserPick(data.locations, user).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Para Centro de Custo</label>
                      <select className="inp" value={modalForm.to_cost_center || ''} onChange={e => setModalForm({...modalForm, to_cost_center: e.target.value})}>
                        <option value="">Selecionar...</option>
                        {filterCostCentersForUserPick(data.costCenters, user).map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="lbl">Responsável</label>
                    <select className="inp" value={modalForm.to_responsible || ''} onChange={e => setModalForm({...modalForm, to_responsible: e.target.value})}>
                      <option value="">Selecionar...</option>
                      {data.users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="lbl">Motivo</label>
                    <textarea className="inp" rows={2} required value={modalForm.reason || ''} onChange={e => setModalForm({...modalForm, reason: e.target.value})}></textarea>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="lbl">Motivo</label>
                      <select className="inp" value={modalForm.reason || 'other'} onChange={e => setModalForm({...modalForm, reason: e.target.value})}>
                        {Object.entries(DISPOSAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="lbl">Data</label>
                      <input type="date" className="inp" value={modalForm.disposal_date || ''} onChange={e => setModalForm({...modalForm, disposal_date: e.target.value})} />
                    </div>
                  </div>
                  <div className="mb-4">
                    <label className="lbl">Justificativa</label>
                    <textarea className="inp" rows={2} required value={modalForm.description || ''} onChange={e => setModalForm({...modalForm, description: e.target.value})}></textarea>
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-s" onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" className={modal.type.startsWith('move') ? 'btn btn-p' : 'btn btn-d'}>
                  {modal.type.startsWith('move') ? 'Confirmar Transferência' : 'Confirmar Baixa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div id="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span>{t.type === 's' ? '✅' : '❌'}</span>
            {t.msg}
          </div>
        ))}
      </div>
      </div>
    </ErrorBoundary>
  );
}
