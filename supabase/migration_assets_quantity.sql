-- Campo quantidade na aquisição do ativo. Execute no SQL Editor do Supabase.

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS quantity integer NULL DEFAULT 1;

UPDATE public.assets SET quantity = 1 WHERE quantity IS NULL;
