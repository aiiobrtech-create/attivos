-- Migrações incrementais para projetos já em produção (execute uma vez no SQL Editor).
-- Instalações novas: use supabase/schema.sql (já inclui estas colunas).

-- Múltiplas fotos por ativo
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS photo_urls text[] NULL;
UPDATE public.assets
SET photo_urls = ARRAY[photo_url]
WHERE photo_url IS NOT NULL
  AND (photo_urls IS NULL OR cardinality(photo_urls) = 0);

-- Quantidade na aquisição
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS quantity integer NULL DEFAULT 1;
UPDATE public.assets SET quantity = 1 WHERE quantity IS NULL;

-- Data de expiração da garantia
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS warranty_expiry text NULL;

-- Bucket de fotos (se ainda não existir)
-- Rode também supabase/storage_asset_photos.sql se o bucket asset-photos não existir.
