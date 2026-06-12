-- Importacao: planilha "Centros de Custo - ATTIVOS.xlsx"
-- Colunas na planilha: Base = nome, Codigo = codigo (6 digitos).
-- Executar no SQL Editor do Supabase (schema public).
-- Reexecucao: ON CONFLICT (id) atualiza code e name.

INSERT INTO public.cost_centers (id, code, name) VALUES
('cc-import-000001', '000001', 'ADM'),
('cc-import-000002', '000002', 'ANTI INCÊNDIO'),
('cc-import-000003', '000003', 'CAIMAN'),
('cc-import-000004', '000004', 'CAPTAÇÃO'),
('cc-import-000005', '000005', 'CIÊNCIA'),
('cc-import-000006', '000006', 'DIRETORIA FLORESTAS'),
('cc-import-000007', '000007', 'ESCRITÓRIO SP'),
('cc-import-000008', '000008', 'IGUAÇU'),
('cc-import-000009', '000009', 'ITNL'),
('cc-import-000010', '000010', 'MKT'),
('cc-import-000011', '000011', 'MONITORAMENTO'),
('cc-import-000012', '000012', 'MUTUM'),
('cc-import-000013', '000013', 'PERIGARA'),
('cc-import-000014', '000014', 'PERIGARA PROJETO PEMEGA'),
('cc-import-000015', '000015', 'REVIS'),
('cc-import-000016', '000016', 'RH'),
('cc-import-000017', '000017', 'SANTA SOFIA'),
('cc-import-000018', '000018', 'SANTA TERESA'),
('cc-import-000019', '000019', 'SOCIOAMBIENTAL MT'),
('cc-import-000020', '000020', 'TAQUARI'),
('cc-import-000021', '000021', 'TAQUARI STA TEREZINHA'),
('cc-import-000022', '000022', 'TRIJUNÇÃO'),
('cc-import-000023', '000023', 'VEREDAS'),
('cc-import-000024', '000024', 'VETERINÁRIOS')
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name;
