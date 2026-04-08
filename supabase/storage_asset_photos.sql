-- Bucket público para fotos dos ativos (URL em public.assets.photo_url).
-- Execute no SQL Editor do Supabase após o schema principal.

INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-photos', 'asset-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública (imagens no site / <img src>)
DROP POLICY IF EXISTS "asset_photos_public_read" ON storage.objects;
CREATE POLICY "asset_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'asset-photos');

-- Usuários autenticados enviam / atualizam / apagam
DROP POLICY IF EXISTS "asset_photos_auth_insert" ON storage.objects;
CREATE POLICY "asset_photos_auth_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'asset-photos');

DROP POLICY IF EXISTS "asset_photos_auth_update" ON storage.objects;
CREATE POLICY "asset_photos_auth_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'asset-photos')
  WITH CHECK (bucket_id = 'asset-photos');

DROP POLICY IF EXISTS "asset_photos_auth_delete" ON storage.objects;
CREATE POLICY "asset_photos_auth_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'asset-photos');
