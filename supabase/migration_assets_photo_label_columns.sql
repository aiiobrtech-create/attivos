-- Execute no SQL Editor do Supabase se o projeto foi criado antes de photo_url / label_scan_value.
-- Sem essas colunas, o upsert de ativos falha (erro de schema / coluna inexistente).
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS photo_url text NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS label_scan_value text NULL;
