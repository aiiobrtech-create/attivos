-- ATTIVOS + Supabase Auth
-- Perfis em public.profiles (id = auth.users.id). Senha só no Auth.
-- Rode no SQL Editor do Supabase (projeto novo ou após backup).
--
-- Se você usou a versão antiga com public.users (senha na tabela), execute antes:
--   supabase/migrate_legacy_users.sql

-- Remove tabela legada que conflita com o modelo Auth
DROP TABLE IF EXISTS public.users CASCADE;

-- ---------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'gestor_patrimonial', 'operador', 'auditor', 'viewer')),
  allowed_location_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  allowed_cost_center_ids jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_uniq ON public.profiles (email);

-- Trigger: cria perfil ao registrar usuário no Auth
CREATE OR REPLACE FUNCTION public.handle_new_attivos_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r text;
  meta_role text;
BEGIN
  meta_role := NULLIF(trim(LOWER(COALESCE(NEW.raw_user_meta_data->>'role', ''))), '');

  IF (SELECT count(*)::int FROM public.profiles) = 0 THEN
    r := 'admin';
  ELSE
    r := COALESCE(meta_role, 'operador');
  END IF;

  IF r NOT IN ('admin', 'gestor_patrimonial', 'operador', 'auditor', 'viewer') THEN
    r := 'operador';
  END IF;

  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), split_part(COALESCE(NEW.email, ''), '@', 1)),
    r
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_attivos ON auth.users;
CREATE TRIGGER on_auth_user_created_attivos
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_attivos_user();

-- Helpers RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_patrimonio()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'gestor_patrimonial', 'operador')
  );
$$;

-- ---------------------------------------------------------------------------
-- Demais tabelas (id text: compatível com o app)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL,
  useful_life_months integer NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cost_centers (
  id text PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.suppliers (
  id text PRIMARY KEY,
  name text NOT NULL,
  type text NULL,
  trade_name text NULL,
  cnpj text NULL,
  cpf text NULL,
  rg text NULL,
  state_registration text NULL,
  email text NULL,
  phone text NULL,
  contact_person text NULL,
  address jsonb NULL,
  observations text NULL
);

CREATE TABLE IF NOT EXISTS public.assets (
  id text PRIMARY KEY,
  asset_code text NOT NULL,
  patrimonial_code text NULL,
  description text NOT NULL,
  status text NOT NULL,
  category_id text NOT NULL,
  cost_center_id text NOT NULL,
  location_id text NOT NULL,
  responsible_id text NOT NULL,
  supplier_id text NULL,
  acquisition_value numeric NULL,
  acquisition_date text NULL,
  serial_number text NULL,
  manufacturer text NULL,
  brand text NULL,
  model text NULL,
  invoice_number text NULL,
  useful_life_months integer NULL,
  observations text NULL,
  photo_url text NULL,
  label_scan_value text NULL,
  geo_lat double precision NULL,
  geo_lng double precision NULL
);

CREATE INDEX IF NOT EXISTS assets_category_id_idx ON public.assets (category_id);
CREATE INDEX IF NOT EXISTS assets_cost_center_id_idx ON public.assets (cost_center_id);
CREATE INDEX IF NOT EXISTS assets_location_id_idx ON public.assets (location_id);
CREATE INDEX IF NOT EXISTS assets_responsible_id_idx ON public.assets (responsible_id);

CREATE TABLE IF NOT EXISTS public.maintenance_orders (
  id text PRIMARY KEY,
  order_number text NOT NULL,
  asset_id text NOT NULL,
  maintenance_type text NOT NULL,
  status text NOT NULL,
  problem_description text NOT NULL,
  service_description text NULL,
  cost numeric NULL,
  opened_at text NOT NULL,
  scheduled_at text NULL,
  completed_at text NULL,
  technician_name text NULL,
  supplier_id text NULL
);

CREATE INDEX IF NOT EXISTS maintenance_orders_asset_id_idx ON public.maintenance_orders (asset_id);

CREATE TABLE IF NOT EXISTS public.movements (
  id text PRIMARY KEY,
  asset_id text NOT NULL,
  movement_type text NOT NULL,
  from_location text NULL,
  to_location text NULL,
  from_cost_center text NULL,
  to_cost_center text NULL,
  from_responsible text NULL,
  to_responsible text NULL,
  reason text NOT NULL,
  movement_date text NOT NULL,
  executor text NOT NULL
);

CREATE INDEX IF NOT EXISTS movements_asset_id_idx ON public.movements (asset_id);

CREATE TABLE IF NOT EXISTS public.disposals (
  id text PRIMARY KEY,
  asset_id text NOT NULL,
  reason text NOT NULL,
  description text NOT NULL,
  disposal_date text NOT NULL,
  sale_value numeric NULL,
  responsible text NOT NULL
);

CREATE INDEX IF NOT EXISTS disposals_asset_id_idx ON public.disposals (asset_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id text PRIMARY KEY,
  entity_type text NOT NULL,
  action text NOT NULL,
  user_email text NOT NULL,
  description text NOT NULL,
  created_at text NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at);

CREATE TABLE IF NOT EXISTS public.asset_history (
  id text PRIMARY KEY,
  asset_id text NOT NULL,
  date text NOT NULL,
  responsible text NOT NULL,
  text text NOT NULL
);

CREATE INDEX IF NOT EXISTS asset_history_asset_id_idx ON public.asset_history (asset_id);
CREATE INDEX IF NOT EXISTS asset_history_date_idx ON public.asset_history (date);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_history ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas (reexecução segura)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'profiles', 'categories', 'cost_centers', 'locations', 'suppliers',
        'assets', 'maintenance_orders', 'movements', 'disposals',
        'audit_logs', 'asset_history'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- profiles
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Tabelas de domínio: leitura para qualquer autenticado; escrita para perfis com permissão
-- categories
CREATE POLICY categories_select ON public.categories FOR SELECT TO authenticated USING (true);
CREATE POLICY categories_ins ON public.categories FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY categories_upd ON public.categories FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY categories_del ON public.categories FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- cost_centers
CREATE POLICY cost_centers_select ON public.cost_centers FOR SELECT TO authenticated USING (true);
CREATE POLICY cost_centers_ins ON public.cost_centers FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY cost_centers_upd ON public.cost_centers FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY cost_centers_del ON public.cost_centers FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- locations
CREATE POLICY locations_select ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY locations_ins ON public.locations FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY locations_upd ON public.locations FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY locations_del ON public.locations FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- suppliers
CREATE POLICY suppliers_select ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY suppliers_ins ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY suppliers_upd ON public.suppliers FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY suppliers_del ON public.suppliers FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- assets
CREATE POLICY assets_select ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY assets_ins ON public.assets FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY assets_upd ON public.assets FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY assets_del ON public.assets FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- maintenance_orders
CREATE POLICY maintenance_orders_select ON public.maintenance_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY maintenance_orders_ins ON public.maintenance_orders FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY maintenance_orders_upd ON public.maintenance_orders FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY maintenance_orders_del ON public.maintenance_orders FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- movements
CREATE POLICY movements_select ON public.movements FOR SELECT TO authenticated USING (true);
CREATE POLICY movements_ins ON public.movements FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY movements_upd ON public.movements FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY movements_del ON public.movements FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- disposals
CREATE POLICY disposals_select ON public.disposals FOR SELECT TO authenticated USING (true);
CREATE POLICY disposals_ins ON public.disposals FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY disposals_upd ON public.disposals FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY disposals_del ON public.disposals FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- asset_history
CREATE POLICY asset_history_select ON public.asset_history FOR SELECT TO authenticated USING (true);
CREATE POLICY asset_history_ins ON public.asset_history FOR INSERT TO authenticated WITH CHECK (public.can_write_patrimonio());
CREATE POLICY asset_history_upd ON public.asset_history FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY asset_history_del ON public.asset_history FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- audit_logs
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY audit_logs_ins ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_logs_upd ON public.audit_logs FOR UPDATE TO authenticated USING (public.can_write_patrimonio()) WITH CHECK (public.can_write_patrimonio());
CREATE POLICY audit_logs_del ON public.audit_logs FOR DELETE TO authenticated USING (public.can_write_patrimonio());

-- Se o projeto já existia sem label_scan_value, rode no Supabase SQL Editor:
-- ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS label_scan_value text NULL;

-- Escopo de visualização por usuário (perfis já criados):
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_location_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS allowed_cost_center_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
