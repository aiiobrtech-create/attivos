-- Garantia na aquisição do ativo. Execute no SQL Editor do Supabase.

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS warranty_expiry text NULL;
