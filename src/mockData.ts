import { Asset, Category, CostCenter, Location, Supplier, User, MaintenanceOrder, Movement, Disposal, AuditLog, AssetHistory } from './types';

export const MOCK_DATA = {
  categories: [
    { id: 'c1', name: 'Equipamentos de TI', code: 'TI', useful_life_months: 60 },
    { id: 'c2', name: 'Móveis e Utensílios', code: 'MU', useful_life_months: 120 },
    { id: 'c3', name: 'Veículos', code: 'VE', useful_life_months: 60 },
    { id: 'c4', name: 'Máquinas e Equipamentos', code: 'ME', useful_life_months: 120 },
  ] as Category[],
  costCenters: [
    { id: 'cc1', code: 'ADM', name: 'Administração' },
    { id: 'cc2', code: 'TI', name: 'Tecnologia da Informação' },
    { id: 'cc3', code: 'RH', name: 'Recursos Humanos' },
    { id: 'cc4', code: 'FIN', name: 'Financeiro' },
    { id: 'cc5', code: 'OPE', name: 'Operações' },
  ] as CostCenter[],
  locations: [
    { id: 'l1', name: 'Sede – Andar 1', code: 'SEDE-A1' },
    { id: 'l2', name: 'Sede – Andar 2', code: 'SEDE-A2' },
    { id: 'l3', name: 'Sala de Servidores', code: 'SEDE-SR' },
    { id: 'l4', name: 'Depósito', code: 'DEP-01' },
    { id: 'l5', name: 'Filial SP', code: 'FIL-SP' },
  ] as Location[],
  suppliers: [
    { id: 's1', name: 'Dell Technologies' },
    { id: 's2', name: 'Lenovo Brasil' },
    { id: 's3', name: 'Steelcase Brasil' },
    { id: 's4', name: 'Honda Automóveis' },
  ] as Supplier[],
  users: [
    { id: 'u1', name: 'Ana Lima', email: 'admin', password: 'admin', role: 'admin' },
    { id: 'u2', name: 'Carlos Souza', email: 'carlos@empresa.com.br', password: 'user', role: 'gestor_patrimonial' },
    { id: 'u3', name: 'Mariana Costa', email: 'mariana@empresa.com.br', password: 'user', role: 'operador' },
    { id: 'u4', name: 'Roberto Alves', email: 'roberto@empresa.com.br', password: 'user', role: 'auditor' },
  ] as User[],
  assets: [
    { id: 'a1', asset_code: 'ATI-2024-00001', patrimonial_code: 'PAT-001', description: 'Notebook Dell Latitude 5420 i7', status: 'active', category_id: 'c1', cost_center_id: 'cc2', location_id: 'l1', responsible_id: 'u2', supplier_id: 's1', acquisition_value: 8500, acquisition_date: '2023-03-15', serial_number: 'SN-DELL-001', manufacturer: 'Dell', brand: 'Dell', model: 'Latitude 5420', observations: 'Notebook para uso do gestor de TI. Com dock station.' },
    { id: 'a2', asset_code: 'ATI-2024-00002', description: 'MacBook Pro M3 16"', status: 'active', category_id: 'c1', cost_center_id: 'cc1', location_id: 'l2', responsible_id: 'u1', supplier_id: 's1', acquisition_value: 15800, acquisition_date: '2024-01-10', serial_number: 'SN-APPLE-002', manufacturer: 'Apple', brand: 'Apple', model: 'MacBook Pro M3' },
    { id: 'a3', asset_code: 'ATI-2024-00003', description: 'Cadeira Ergonômica Steelcase Leap', status: 'active', category_id: 'c2', cost_center_id: 'cc1', location_id: 'l1', responsible_id: 'u1', supplier_id: 's3', acquisition_value: 3200, acquisition_date: '2022-11-20', serial_number: '', manufacturer: 'Steelcase', brand: 'Steelcase', model: 'Leap V2' },
    { id: 'a4', asset_code: 'ATI-2024-00004', description: 'Servidor Dell PowerEdge R740', status: 'maintenance', category_id: 'c1', cost_center_id: 'cc2', location_id: 'l3', responsible_id: 'u2', supplier_id: 's1', acquisition_value: 45000, acquisition_date: '2021-06-01', serial_number: 'SN-DELL-SRV-004', manufacturer: 'Dell', brand: 'Dell', model: 'PowerEdge R740' },
    { id: 'a5', asset_code: 'ATI-2024-00005', description: 'Honda Civic 2023 EX', status: 'active', category_id: 'c3', cost_center_id: 'cc1', location_id: 'l1', responsible_id: 'u1', supplier_id: 's4', acquisition_value: 135000, acquisition_date: '2023-09-05', serial_number: '9BWZZZ377VT004251', manufacturer: 'Honda', brand: 'Honda', model: 'Civic EX 2023' },
    { id: 'a6', asset_code: 'ATI-2024-00006', description: 'Impressora HP LaserJet Pro', status: 'scrapped', category_id: 'c1', cost_center_id: 'cc3', location_id: 'l4', responsible_id: 'u3', supplier_id: 's1', acquisition_value: 1200, acquisition_date: '2019-04-12', serial_number: 'SN-HP-006', manufacturer: 'HP', brand: 'HP', model: 'LaserJet Pro M404n' },
    { id: 'a7', asset_code: 'ATI-2024-00007', description: 'Mesa de Escritório L-Shape', status: 'active', category_id: 'c2', cost_center_id: 'cc2', location_id: 'l1', responsible_id: 'u2', supplier_id: 's3', acquisition_value: 2800, acquisition_date: '2022-03-10', serial_number: '', manufacturer: 'Steelcase', brand: 'Steelcase', model: 'Answer L-Shape' },
    { id: 'a8', asset_code: 'ATI-2024-00008', description: 'Switch Cisco Catalyst 2960X', status: 'active', category_id: 'c1', cost_center_id: 'cc2', location_id: 'l3', responsible_id: 'u2', supplier_id: 's1', acquisition_value: 9800, acquisition_date: '2022-08-22', serial_number: 'SN-CISCO-008', manufacturer: 'Cisco', brand: 'Cisco', model: 'Catalyst 2960X-48TS' },
    { id: 'a9', asset_code: 'ATI-2024-00009', description: 'Monitor LG UltraWide 34"', status: 'active', category_id: 'c1', cost_center_id: 'cc2', location_id: 'l1', responsible_id: 'u2', supplier_id: 's1', acquisition_value: 2500, acquisition_date: '2023-12-10', serial_number: 'SN-LG-009', manufacturer: 'LG', brand: 'LG', model: '34WP550' },
    { id: 'a10', asset_code: 'ATI-2024-00010', description: 'Ar Condicionado Split 12000 BTUs', status: 'active', category_id: 'c4', cost_center_id: 'cc5', location_id: 'l5', responsible_id: 'u3', supplier_id: 's2', acquisition_value: 1800, acquisition_date: '2022-01-15', serial_number: 'SN-SAMSUNG-010', manufacturer: 'Samsung', brand: 'Samsung', model: 'Digital Inverter' },
  ] as Asset[],
  maintenanceOrders: [
    { id: 'm1', order_number: 'MNT-2024-000001', asset_id: 'a4', maintenance_type: 'corrective', status: 'open', problem_description: 'Servidor apresentando falha no RAID 5. Um dos discos com falha.', cost: undefined, opened_at: '2024-11-15T09:00:00Z', scheduled_at: '2024-11-20T14:00:00Z', completed_at: undefined, technician_name: 'João Técnico', supplier_id: 's1' },
    { id: 'm2', order_number: 'MNT-2024-000002', asset_id: 'a1', maintenance_type: 'preventive', status: 'completed', problem_description: 'Manutenção preventiva semestral do notebook.', service_description: 'Limpeza interna, troca de pasta térmica, atualização de drivers.', cost: 350, opened_at: '2024-09-01T08:00:00Z', scheduled_at: '2024-09-05T10:00:00Z', completed_at: '2024-09-05T12:30:00Z', technician_name: 'Maria Técnica', supplier_id: 's2' },
  ] as MaintenanceOrder[],
  movements: [
    { id: 'mv1', asset_id: 'a1', movement_type: 'transfer', from_location: 'Filial SP', to_location: 'Sede – Andar 1', from_responsible: 'Roberto Alves', to_responsible: 'Carlos Souza', reason: 'Realocação por mudança de função.', movement_date: '2024-10-14T11:00:00Z', executor: 'Ana Lima' },
    { id: 'mv2', asset_id: 'a5', movement_type: 'transfer', from_cost_center: 'Financeiro', to_cost_center: 'Administração', from_responsible: 'Mariana Costa', to_responsible: 'Ana Lima', reason: 'Transferência por reorganização de departamento.', movement_date: '2024-09-22T16:30:00Z', executor: 'Carlos Souza' },
  ] as Movement[],
  disposals: [
    { id: 'd1', asset_id: 'a6', reason: 'scrap', description: 'Impressora com defeito irreparável e fora de garantia. Obsoleta tecnologicamente.', disposal_date: '2024-08-10', sale_value: undefined, responsible: 'Mariana Costa' },
  ] as Disposal[],
  auditLogs: [
    { id: 'al1', entity_type: 'asset', action: 'create', user_email: 'ana@empresa.com.br', description: 'Ativo ATI-2024-00001 criado', created_at: '2024-03-15T10:30:00Z' },
    { id: 'al2', entity_type: 'asset_movement', action: 'transfer', user_email: 'ana@empresa.com.br', description: 'Ativo ATI-2024-00001 transferido para Sede', created_at: '2024-10-14T11:02:00Z' },
    { id: 'al3', entity_type: 'maintenance_order', action: 'create', user_email: 'carlos@empresa.com.br', description: 'Ordem MNT-2024-000001 aberta para servidor', created_at: '2024-11-15T09:05:00Z' },
    { id: 'al4', entity_type: 'asset', action: 'update', user_email: 'carlos@empresa.com.br', description: 'Status do ativo ATI-2024-00004 alterado para Em Manutenção', created_at: '2024-11-15T09:05:00Z' },
    { id: 'al5', entity_type: 'maintenance_order', action: 'close', user_email: 'carlos@empresa.com.br', description: 'Ordem MNT-2024-000002 encerrada com sucesso', created_at: '2024-09-05T12:35:00Z' },
    { id: 'al6', entity_type: 'asset_disposal', action: 'dispose', user_email: 'mariana@empresa.com.br', description: 'Ativo ATI-2024-00006 baixado por sucateamento', created_at: '2024-08-10T15:00:00Z' },
  ] as AuditLog[],
  assetHistory: [
    { id: 'h1', asset_id: 'a1', date: '2024-01-20T10:00:00Z', responsible: 'Ana Lima', text: 'Verificação de rotina realizada. Equipamento em perfeitas condições.' },
    { id: 'h2', asset_id: 'a1', date: '2024-02-15T14:30:00Z', responsible: 'Carlos Souza', text: 'Atualização do sistema operacional concluída com sucesso.' }
  ] as AssetHistory[],
};
