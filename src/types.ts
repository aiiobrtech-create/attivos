export type AssetStatus = 'active' | 'maintenance' | 'transferred' | 'disposed' | 'stolen' | 'scrapped' | 'inactive';

export interface Category {
  id: string;
  name: string;
  code: string;
  useful_life_months: number;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  name: string;
  code: string;
}

export interface Supplier {
  id: string;
  name: string;
  type: 'PF' | 'PJ';
  trade_name?: string;
  cnpj?: string;
  cpf?: string;
  rg?: string;
  state_registration?: string;
  email?: string;
  phone?: string;
  contact_person?: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zip_code?: string;
  };
  observations?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: string;
  /** Se preenchido, o usuário (exceto admin) só enxerga ativos dessas localizações. Vazio = sem filtro por local. */
  allowed_location_ids?: string[];
  /** Se preenchido, o usuário (exceto admin) só enxerga ativos desses centros de custo. Vazio = sem filtro por CC. */
  allowed_cost_center_ids?: string[];
}

export interface Asset {
  id: string;
  asset_code: string;
  patrimonial_code?: string;
  description: string;
  status: AssetStatus;
  category_id: string;
  cost_center_id: string;
  location_id: string;
  responsible_id: string;
  supplier_id?: string;
  acquisition_value?: number;
  acquisition_date?: string;
  serial_number?: string;
  manufacturer?: string;
  brand?: string;
  model?: string;
  invoice_number?: string;
  useful_life_months?: number;
  observations?: string;
  photo_url?: string;
  /** Texto fixo codificado no QR/código de barras no momento do cadastro (não alterar). */
  label_scan_value?: string;
}

export interface MaintenanceOrder {
  id: string;
  order_number: string;
  asset_id: string;
  maintenance_type: 'preventive' | 'corrective';
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  problem_description: string;
  service_description?: string;
  cost?: number;
  opened_at: string;
  scheduled_at?: string;
  completed_at?: string;
  technician_name?: string;
  supplier_id?: string;
}

export interface Movement {
  id: string;
  asset_id: string;
  movement_type: 'transfer' | 'loan' | 'return';
  from_location?: string;
  to_location?: string;
  from_cost_center?: string;
  to_cost_center?: string;
  from_responsible?: string;
  to_responsible?: string;
  reason: string;
  movement_date: string;
  executor: string;
}

export interface Disposal {
  id: string;
  asset_id: string;
  reason: 'sale' | 'scrap' | 'theft' | 'loss' | 'obsolescence' | 'donation' | 'other';
  description: string;
  disposal_date: string;
  sale_value?: number;
  responsible: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  action: string;
  user_email: string;
  description: string;
  created_at: string;
}

export interface AssetHistory {
  id: string;
  asset_id: string;
  date: string;
  responsible: string;
  text: string;
}

export interface AppData {
  assets: Asset[];
  categories: Category[];
  locations: Location[];
  costCenters: CostCenter[];
  users: User[];
  maintenanceOrders: MaintenanceOrder[];
  movements: Movement[];
  disposals: Disposal[];
  suppliers: Supplier[];
  auditLogs: AuditLog[];
  assetHistory: AssetHistory[];
}
