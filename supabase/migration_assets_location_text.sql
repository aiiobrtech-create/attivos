-- Localização livre (digitável) no ativo. Execute no SQL Editor do Supabase.

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS location_text text NULL;
ALTER TABLE public.assets ALTER COLUMN location_id DROP NOT NULL;

UPDATE public.assets a
SET location_text = l.name
FROM public.locations l
WHERE a.location_id = l.id
  AND (a.location_text IS NULL OR trim(a.location_text) = '');
