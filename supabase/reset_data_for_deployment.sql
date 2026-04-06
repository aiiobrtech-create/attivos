-- =============================================================================
-- ATTIVOS — Zerar dados para implantação / ambiente limpo
-- =============================================================================
-- Rode no Supabase: SQL Editor, com usuário que tenha permissão em `auth`.
-- FAÇA BACKUP/export antes. Operação destrutiva.
--
-- O que remove:
--   • Todo o patrimônio (ativos, manutenções, movimentações, baixas, histórico)
--   • Logs de auditoria
--   • Cadastros auxiliares (categorias, localizações, centros de custo, fornecedores)
--   • Todos os usuários do Supabase Auth (e perfis em public.profiles em cascata)
--
-- Depois: crie o primeiro usuário pelo app (cadastro/login). O trigger fará o
-- primeiro perfil como admin se public.profiles estiver vazio.
--
-- No app: não use VITE_SEED_DEMO_DATA=1 em produção — com essa flag, um banco
-- vazio é repovoado automaticamente com dados de demonstração ao logar.
-- =============================================================================

BEGIN;

-- Patrimônio e cadastros (sem FKs declaradas entre essas tabelas no schema atual)
TRUNCATE TABLE
  public.asset_history,
  public.audit_logs,
  public.disposals,
  public.movements,
  public.maintenance_orders,
  public.assets,
  public.suppliers,
  public.locations,
  public.cost_centers,
  public.categories
CASCADE;

-- Remove todos os logins. Apaga public.profiles automaticamente (ON DELETE CASCADE).
DELETE FROM auth.users;

COMMIT;

-- =============================================================================
-- Variante: manter usuários e só limpar patrimônio + cadastros
-- =============================================================================
-- Comente o DELETE acima e use apenas o TRUNCATE (já executado acima), OU rode
-- só o bloco abaixo em outra sessão:
--
-- BEGIN;
-- TRUNCATE TABLE
--   public.asset_history,
--   public.audit_logs,
--   public.disposals,
--   public.movements,
--   public.maintenance_orders,
--   public.assets,
--   public.suppliers,
--   public.locations,
--   public.cost_centers,
--   public.categories
-- CASCADE;
-- COMMIT;
--
-- (Perfis com allowed_location_ids / allowed_cost_center_ids podem ficar com IDs
--  órfãos até você reconfigurar o escopo no cadastro de usuários.)
-- =============================================================================
