-- Suporte a múltiplas fotos por ativo (até 10). Execute no SQL Editor do Supabase.

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS photo_urls text[] NULL;

UPDATE public.assets
SET photo_urls = ARRAY[photo_url]
WHERE photo_url IS NOT NULL
  AND (photo_urls IS NULL OR cardinality(photo_urls) = 0);
