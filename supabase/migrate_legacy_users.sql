-- Execute APENAS se você já tinha criado a tabela antiga public.users (login com senha na tabela).
-- Depois rode novamente supabase/schema.sql (ou só a parte de profiles/trigger se preferir).

DROP TABLE IF EXISTS public.users CASCADE;
